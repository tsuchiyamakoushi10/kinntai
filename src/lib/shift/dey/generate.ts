/**
 * デイサービス 月次シフト 自動生成 (事業所専用パスの雛形)。
 *
 * docs/auto-shift-design-v2.md §10 案A / 設計書 §3。配置基準は「午前◯名・午後◯名」
 * (office_coverage_demands)、勤務記号の午前/午後カウントは ShiftPattern.am/pm_count
 * (勤務記号マスター由来)。
 *
 * 方針 (完璧な解は狙わない。8 割組む→過不足を色で見る→人が直す):
 *   1. 常勤を デ日 で先に配置 (月目標日数まで・連勤上限内・希望休尊重)。
 *   2. 非常勤で午前/午後の不足を平等配分で穴埋め (PM 不足=デ短A 終日 / AM だけ不足=半日A)。
 *   3. 残りは公休。休業日 (必要数 0) は全員公休。
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
  /** 生活相談員か (午前/午後 各 N 名の充足チェック用。配置は強制しない)。 */
  isCounselor: boolean;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外をまとめて渡す。 */
  unavailableDates: ReadonlySet<string>;
  /** 月の目標出勤日数 (常勤のみ使用。既定 21)。これに達したら以降は公休。 */
  targetWorkDays: number;
};

/** 1 日種ぶんの配置基準 (午前/午後 + 相談員)。office_coverage_demands 由来 (夜勤は デイで未使用)。 */
export type DeyDemand = {
  am: number;
  pm: number;
  counselorAm: number;
  counselorPm: number;
};

/** 使用する勤務記号と上限。 */
export type DeyConfig = {
  maxConsecutiveDays: number;
  symbols: {
    /** 常勤の終日 (例: デ日)。 */
    fullDay: string;
    /** 非常勤の終日 (例: デ短A)。PM 不足時に使う。 */
    partFullDay: string;
    /** 非常勤の午前 (例: 半日A)。AM だけ不足時に使う。 */
    partAm: string;
    /** 公休 (例: 公休)。 */
    off: string;
  };
};

export const DEY_DEFAULT_CONFIG: DeyConfig = {
  maxConsecutiveDays: 6,
  symbols: { fullDay: "デ日", partFullDay: "デ短A", partAm: "半日A", off: "公休" },
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
  const fullTimers = employees.filter((e) => e.isFullTime);
  const partTimers = employees.filter((e) => !e.isFullTime);
  const counselorIds = new Set(employees.filter((e) => e.isCounselor).map((e) => e.id));

  const workDays = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const consecutive = new Map<string, number>(employees.map((e) => [e.id, 0]));

  const assignments: DeyAssignment[] = [];
  const dayResults: DeyDayResult[] = [];

  for (const day of input.days) {
    const demand = input.demandByDayKind[day.dayKind];
    const operating = isOperating(demand);
    const today = new Map<string, string>(); // employeeId -> 勤務記号

    if (operating) {
      const eligible = (e: DeyEmployee): boolean =>
        !e.unavailableDates.has(day.date) && consecutive.get(e.id)! < config.maxConsecutiveDays;

      // Phase 1: 常勤を デ日 で配置 (相談員優先 → 目標残り多い順 → 累計少ない順)。
      const ftCandidates = fullTimers
        .filter((e) => eligible(e) && workDays.get(e.id)! < e.targetWorkDays)
        .sort((a, b) => {
          if (a.isCounselor !== b.isCounselor) return a.isCounselor ? -1 : 1;
          const remA = a.targetWorkDays - workDays.get(a.id)!;
          const remB = b.targetWorkDays - workDays.get(b.id)!;
          if (remA !== remB) return remB - remA;
          const cntA = workDays.get(a.id)!;
          const cntB = workDays.get(b.id)!;
          if (cntA !== cntB) return cntA - cntB;
          return a.employeeCode.localeCompare(b.employeeCode);
        });
      for (const e of ftCandidates) today.set(e.id, config.symbols.fullDay);

      // Phase 2: 非常勤で午前/午後不足を平等配分で穴埋め。
      // 累計出勤が最も少ない人から、PM 不足なら終日(デ短A)、AM だけ不足なら午前(半日A)。
      let guard = 0;
      while (guard++ < 10_000) {
        const present = countPresence(toAssignments(today), input.master);
        const amShort = present.am < demand.am;
        const pmShort = present.pm < demand.pm;
        if (!amShort && !pmShort) break;

        const candidates = partTimers
          .filter((e) => eligible(e) && !today.has(e.id))
          .sort((a, b) => {
            const cntA = workDays.get(a.id)!;
            const cntB = workDays.get(b.id)!;
            if (cntA !== cntB) return cntA - cntB;
            return a.employeeCode.localeCompare(b.employeeCode);
          });
        if (candidates.length === 0) break; // 人員不足。下の評価で不足として可視化される。

        const pick = candidates[0]!;
        today.set(pick.id, pmShort ? config.symbols.partFullDay : config.symbols.partAm);
      }
    }

    // セル出力 + 状態更新。勤務した人は出勤+連勤++、それ以外は公休で連勤リセット。
    for (const e of employees) {
      const work = today.get(e.id);
      if (work) {
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: work });
        workDays.set(e.id, workDays.get(e.id)! + 1);
        consecutive.set(e.id, consecutive.get(e.id)! + 1);
      } else {
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: config.symbols.off });
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
