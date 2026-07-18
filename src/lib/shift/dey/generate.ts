/**
 * デイサービス 月次シフト 自動生成 (事業所専用パスの雛形)。
 *
 * docs/auto-shift-design-v2.md §10 案A / 設計書 §3。配置基準は「午前◯名・午後◯名」
 * (office_coverage_demands)、勤務記号の午前/午後カウントは ShiftPattern.am/pm_count
 * (勤務記号マスター由来)。
 *
 * 方針 (完璧な解は狙わない。8 割組む→過不足を色で見る→人が直す):
 *   0. 相談員 (生活相談員) を必要数だけ最優先で確保 (常勤/非常勤問わず。希望休・連勤上限は
 *      守るが月目標日数は超えてよい = 相談員カバレッジ優先・負担は分散)。
 *   1. 常勤を デ日 で配置 (月目標日数を月内で均等にペース配分・連勤上限内・希望休尊重)。
 *      営業日に常勤が 2 人以上同時に公休にならないよう調整 (強制休み重複時を除く)。
 *   2. 非常勤等で午前/午後の不足を平等配分で穴埋め。送迎(8:15開始)が必要数に満つまで
 *      8:15系記号を優先採用し、満ちたら 9:00系で残りを埋める。半日のみ職員は午前記号のみ。
 *   3. 有給希望日は有休、残りは公休。休業日 (必要数 0) は全員公休 (有給日は有休)。
 *
 * DB に触れない純粋関数。常勤/非常勤の判定や記号→DB パターンの対応は呼び出し側が担う。
 * 決定論: 同じ入力なら同じ結果 (employeeCode で安定ソート、乱数は使わない)。
 */
import type { DayKind } from "@prisma/client";

import {
  countPresence,
  evaluateCoverage,
  type CoverageResult,
  type SymbolMaster,
} from "@/lib/shift/coverage";

/** 当月の 1 日ぶん (日付と日種)。 */
export type DeyDay = {
  /** "YYYY-MM-DD" */
  date: string;
  dayKind: DayKind;
};

/** デイの自動生成に渡す職員。 */
export type DeyEmployee = {
  id: string;
  /** 安定ソート用 (決定論)。 */
  employeeCode: string;
  /** 常勤か (v1 は雇用形態由来。正社員/契約=常勤)。 */
  isFullTime: boolean;
  /**
   * 正社員 (雇用形態 FULL_TIME) か。true の人は月の所定労働日数を「厳守」する。
   * 有休は所定労働日数に含める方針なので、実勤務目標 = targetWorkDays - 当月有休日数 を
   * 上限かつ下限として扱う (デイは Phase 1 が常勤を毎営業日フル配置するので下限は自然に満ちる)。
   * false (パート等) は従来どおり targetWorkDays を上限としてのみ扱う。未指定は false。
   */
  isRegular?: boolean;
  /** 生活相談員か。各営業日に必要数だけ最優先で配置する (Phase 0)。 */
  isCounselor: boolean;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外をまとめて渡す (→ 公休)。 */
  unavailableDates: ReadonlySet<string>;
  /** 有給の日 ("YYYY-MM-DD")。必ず休みにし、セルは有休で出す (勤務は入れない)。 */
  paidLeaveDates: ReadonlySet<string>;
  /**
   * 管理者の事務日 / 実績周り日 ("YYYY-MM-DD" → 勤務記号名)。指定日はその記号で固定配置し
   * 公休を入れない。勤務日数・連勤にカウントし、フロア人数 (午前/午後) にもカウントする
   * (記号の am/pm_count に従う)。管理者 (Employee.isManager) のみ。
   */
  managerDutyDates?: ReadonlyMap<string, string>;
  /** 半日勤務しかしない職員か。終日(デ短/デ日)を割り当てず午前(半日)のみにする。 */
  halfDayOnly: boolean;
  /** 月の目標出勤日数 (常勤のみ使用。既定 21)。これに達したら以降は公休。 */
  targetWorkDays: number;
};

/** 1 日種ぶんの配置基準 (午前/午後 + 相談員 + 送迎)。office_coverage_demands 由来。 */
export type DeyDemand = {
  am: number;
  pm: number;
  counselorAm: number;
  counselorPm: number;
  /** 午前のうち送迎(8:15開始)で必要な人数。0 = 送迎の区別なし。 */
  earlyAm: number;
};

/** 使用する勤務記号と上限。送迎(8:15)系と出勤(9:00)系を分ける。 */
export type DeyConfig = {
  maxConsecutiveDays: number;
  symbols: {
    /** 常勤の終日 (8:15開始・送迎。例: デ日)。 */
    fullDay: string;
    /** 非常勤の終日・送迎 (8:15開始。例: デ短D)。 */
    earlyPartFullDay: string;
    /** 非常勤の午前・送迎 (8:15開始。例: 半日D)。 */
    earlyPartAm: string;
    /** 非常勤の終日・出勤 (9:00開始。例: デ短A)。 */
    latePartFullDay: string;
    /** 非常勤の午前・出勤 (9:00開始。例: 半日A)。 */
    latePartAm: string;
    /** 公休 (例: 公休)。 */
    off: string;
    /** 有休 (例: 有休)。有給希望日に使う。 */
    paidLeave: string;
  };
};

export const DEY_DEFAULT_CONFIG: DeyConfig = {
  maxConsecutiveDays: 6,
  symbols: {
    fullDay: "デ日",
    earlyPartFullDay: "デ短D",
    earlyPartAm: "半日D",
    latePartFullDay: "デ短A",
    latePartAm: "半日A",
    off: "公休",
    paidLeave: "有休",
  },
};

export const DEY_DEFAULT_TARGET_WORK_DAYS = 21;

export type GenerateDeyInput = {
  days: ReadonlyArray<DeyDay>;
  employees: ReadonlyArray<DeyEmployee>;
  /** 日種ごとの配置基準。無い日種・必要数 0 の日種は休業日扱い。 */
  demandByDayKind: Partial<Record<DayKind, DeyDemand>>;
  /** 記号 → 午前/午後カウント (ShiftPattern.am/pm_count 由来)。 */
  master: SymbolMaster;
  config?: DeyConfig;
};

/** 1 セルの割当 (公休も含む)。 */
export type DeyAssignment = {
  employeeId: string;
  date: string;
  baseSymbol: string;
};

/** 1 日の結果 (過不足の可視化用)。 */
export type DeyDayResult = {
  date: string;
  dayKind: DayKind;
  operating: boolean;
  /** その日の午前/午後在席・相談員充足など (休業日は null)。 */
  coverage: CoverageResult | null;
};

export type GenerateDeyResult = {
  /** 全職員 × 全日 のセル (勤務 or 公休)。 */
  assignments: DeyAssignment[];
  days: DeyDayResult[];
  /** 職員ごとの出勤日数 (公休除く)。常勤の目標未達確認に使う。 */
  workDaysByEmployee: Record<string, number>;
};

function isOperating(demand: DeyDemand | undefined): demand is DeyDemand {
  return !!demand && demand.am + demand.pm > 0;
}

export function generateDey(input: GenerateDeyInput): GenerateDeyResult {
  const config = input.config ?? DEY_DEFAULT_CONFIG;
  const employees = [...input.employees].sort((a, b) =>
    a.employeeCode.localeCompare(b.employeeCode),
  );
  // フル勤務する常勤 (Phase 1)。半日のみ職員は常勤でも除外し、穴埋めプールで午前のみ扱う。
  const fullPool = employees.filter((e) => e.isFullTime && !e.halfDayOnly);
  const fillPool = employees.filter((e) => !(e.isFullTime && !e.halfDayOnly));
  const counselorIds = new Set(employees.filter((e) => e.isCounselor).map((e) => e.id));

  // 正社員の実効目標: 有休は所定労働日数に含めるので、実勤務目標 = 目標 - 当月有休日数。
  // これを上限かつ下限として扱う。非正社員は目標をそのまま上限としてのみ使う (従来どおり)。
  const monthDateSet = new Set(input.days.map((d) => d.date));
  const paidLeaveInMonth = (e: DeyEmployee): number => {
    let n = 0;
    for (const dte of e.paidLeaveDates) if (monthDateSet.has(dte)) n += 1;
    return n;
  };
  const targetOf = new Map<string, number>(
    employees.map((e) => [
      e.id,
      e.isRegular ? Math.max(0, e.targetWorkDays - paidLeaveInMonth(e)) : e.targetWorkDays,
    ]),
  );
  const target = (e: DeyEmployee): number => targetOf.get(e.id)!;

  const workDays = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const consecutive = new Map<string, number>(employees.map((e) => [e.id, 0]));

  // ペース配分用: 当月の総営業日数と、ここまでの経過営業日数。
  const totalOperating = input.days.reduce(
    (n, d) => n + (isOperating(input.demandByDayKind[d.dayKind]) ? 1 : 0),
    0,
  );
  let operatingSoFar = 0;

  const assignments: DeyAssignment[] = [];
  const dayResults: DeyDayResult[] = [];

  for (const day of input.days) {
    const demand = input.demandByDayKind[day.dayKind];
    const operating = isOperating(demand);
    const today = new Map<string, string>(); // employeeId -> 勤務記号

    // 管理者の事務日 / 実績周り日を最優先で固定配置 (公休を入れない)。以降のフェーズは
    // eligible の today.has 判定で除外されるので二重配置・上書きしない。休業日でも指定があれば置く。
    for (const e of employees) {
      const duty = e.managerDutyDates?.get(day.date);
      if (duty && !today.has(e.id)) today.set(e.id, duty);
    }

    if (operating) {
      operatingSoFar++;
      const eligible = (e: DeyEmployee): boolean =>
        !today.has(e.id) &&
        !e.unavailableDates.has(day.date) &&
        !e.paidLeaveDates.has(day.date) &&
        consecutive.get(e.id)! < config.maxConsecutiveDays &&
        // 月の総勤務日数 (目標) を超えない (ハード上限)。相談員確保・穴埋めもこれを超えない。
        // デイは夜勤が無いので workDays = 日中の出勤日数。超える日は不足のまま (人が手動調整)。
        // 正社員は有休を差し引いた実効目標 (所定 - 有休) を上限にする。
        workDays.get(e.id)! < target(e);

      // Phase 0: 相談員の充足を最優先で確保する。
      // 職種で判定し、常勤/非常勤を問わず、その日の必要数 (counselorAm/Pm の多い方) まで先に置く。
      // availability と連勤上限は守るが、月目標日数は超えてもよい (相談員カバレッジを優先)。
      // 全相談員が希望休/連勤上限の日は確保できず、下の評価で不足として残る。
      const counselorNeed = Math.max(demand.counselorAm, demand.counselorPm);
      if (counselorNeed > 0) {
        const counselorCandidates = employees
          .filter((e) => e.isCounselor && eligible(e))
          .sort((a, b) => {
            // 目標未達を優先 (なるべく超過させない) → 累計少ない順 (負担分散) → 常勤優先 → コード順。
            const overA = workDays.get(a.id)! >= target(a) ? 1 : 0;
            const overB = workDays.get(b.id)! >= target(b) ? 1 : 0;
            if (overA !== overB) return overA - overB;
            const cntA = workDays.get(a.id)!;
            const cntB = workDays.get(b.id)!;
            if (cntA !== cntB) return cntA - cntB;
            if (a.isFullTime !== b.isFullTime) return a.isFullTime ? -1 : 1;
            return a.employeeCode.localeCompare(b.employeeCode);
          });
        for (const e of counselorCandidates.slice(0, counselorNeed)) {
          const sym = e.halfDayOnly
            ? config.symbols.latePartAm
            : e.isFullTime
              ? config.symbols.fullDay
              : config.symbols.latePartFullDay;
          today.set(e.id, sym);
        }
      }

      // Phase 1: 常勤を デ日 で配置。
      // ペース配分: 「ここまでに働くべき理想累計 (目標 × 経過営業日 / 総営業日)」に達した人は
      // 休んでよい (休みを月内に均等分散・月末がスカスカにならない)。
      // ただし営業日に常勤の公休は最大1人 (強制休み重複時を除く)。2人以上が休みになりそうなら
      // ペース超過でも出勤させる。
      const idealWorkDaysBy = (e: DeyEmployee): number =>
        totalOperating > 0 ? Math.round((target(e) * operatingSoFar) / totalOperating) : 0;
      const ftNotPlaced = fullPool.filter((e) => !today.has(e.id));
      const ftEligible = ftNotPlaced.filter((e) => eligible(e));
      // 希望休/有給/連勤上限で強制的に休む常勤の数
      const forcedRestCount = ftNotPlaced.length - ftEligible.length;
      // 目標日数に達した常勤は休ませる (目標超過させてまで出勤はしない)。
      const atTarget = ftEligible.filter((e) => workDays.get(e.id)! >= target(e));
      const underTarget = ftEligible.filter((e) => workDays.get(e.id)! < target(e));
      // 目標内でペース的に休んでよい人 (ideal 到達済)。
      const ahead = underTarget.filter((e) => workDays.get(e.id)! >= idealWorkDaysBy(e));
      // 営業日に休ませてよい常勤は最大1人。強制休み・目標到達休みを差し引く。
      const allowedVoluntaryRest = Math.max(0, 1 - forcedRestCount - atTarget.length);
      // 働きすぎ (ideal 超過大) を優先して休ませる → コード順。先頭 allowedVoluntaryRest 人だけ休み。
      const restingAhead = new Set(
        [...ahead]
          .sort((a, b) => {
            const overA = workDays.get(a.id)! - idealWorkDaysBy(a);
            const overB = workDays.get(b.id)! - idealWorkDaysBy(b);
            if (overA !== overB) return overB - overA;
            return a.employeeCode.localeCompare(b.employeeCode);
          })
          .slice(0, allowedVoluntaryRest)
          .map((e) => e.id),
      );
      // 目標未達の常勤は基本出勤 (休みは restingAhead の人だけ)。目標到達者は休み。
      for (const e of underTarget) {
        if (!restingAhead.has(e.id)) today.set(e.id, config.symbols.fullDay);
      }

      // Phase 2: 穴埋め。送迎(8:15)が必要数に満つまで 8:15系を優先採用、満ちたら 9:00系。
      // 半日のみ職員は午前記号のみ。午後だけ不足のときは半日のみ職員は選ばない。
      let guard = 0;
      while (guard++ < 10_000) {
        const present = countPresence(toAssignments(today), input.master);
        const amShort = present.am < demand.am;
        const pmShort = present.pm < demand.pm;
        if (!amShort && !pmShort) break;
        const earlyShort = countEarlyAm(today, input.master) < demand.earlyAm;
        const onlyPm = pmShort && !amShort; // 午前は足り午後だけ不足

        const candidates = fillPool
          .filter((e) => eligible(e) && !today.has(e.id) && !(onlyPm && e.halfDayOnly))
          .sort((a, b) => {
            const cntA = workDays.get(a.id)!;
            const cntB = workDays.get(b.id)!;
            if (cntA !== cntB) return cntA - cntB;
            return a.employeeCode.localeCompare(b.employeeCode);
          });
        if (candidates.length === 0) break; // 人員不足。下の評価で不足として可視化される。

        const pick = candidates[0]!;
        const wantFull = pmShort && !pick.halfDayOnly;
        const sym = earlyShort
          ? wantFull
            ? config.symbols.earlyPartFullDay
            : config.symbols.earlyPartAm
          : wantFull
            ? config.symbols.latePartFullDay
            : config.symbols.latePartAm;
        today.set(pick.id, sym);
      }
    }

    // セル出力 + 状態更新。勤務した人は出勤+連勤++、有給日は有休、それ以外は公休で連勤リセット。
    for (const e of employees) {
      const work = today.get(e.id);
      if (work) {
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: work });
        workDays.set(e.id, workDays.get(e.id)! + 1);
        consecutive.set(e.id, consecutive.get(e.id)! + 1);
      } else {
        // 有給希望日は有休、それ以外 (希望休/勤務不可/休業日/配置なし) は公休。
        const symbol = e.paidLeaveDates.has(day.date)
          ? config.symbols.paidLeave
          : config.symbols.off;
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: symbol });
        consecutive.set(e.id, 0);
      }
    }

    const coverage =
      operating && demand
        ? evaluateCoverage(
            toAssignments(today),
            input.master,
            {
              am: demand.am,
              pm: demand.pm,
              counselorAm: demand.counselorAm,
              counselorPm: demand.counselorPm,
            },
            (id) => counselorIds.has(id),
          )
        : null;
    dayResults.push({ date: day.date, dayKind: day.dayKind, operating, coverage });
  }

  return {
    assignments,
    days: dayResults,
    workDaysByEmployee: Object.fromEntries(workDays),
  };
}

function toAssignments(today: Map<string, string>): { employeeId: string; baseSymbol: string }[] {
  return [...today.entries()].map(([employeeId, baseSymbol]) => ({ employeeId, baseSymbol }));
}

/** その日の送迎(8:15開始)の午前在席数。isEarly かつ amCount>0 の記号を数える。 */
function countEarlyAm(today: Map<string, string>, master: SymbolMaster): number {
  let n = 0;
  for (const sym of today.values()) {
    const c = master.get(sym);
    if (c?.isEarly && c.amCount > 0) n += 1;
  }
  return n;
}
