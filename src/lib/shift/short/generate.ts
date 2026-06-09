/**
 * ショートステイ 月次シフト 自動生成 (事業所専用パスの雛形)。
 *
 * docs/auto-shift-design-v2.md §10 案A + Phase 2(夜勤先取り)。デイ (generateDey) との違いは
 * 「夜勤を日中より先に固める」こと。介護現場では夜勤を先に確保するのが実務 (デイ=常勤先取り、
 * ショート=夜勤先取り)。
 *
 * 流れ (完璧な解は狙わない。8 割組む→過不足を色で見る→人が直す):
 *   Phase 2  夜勤サイクルを先取り (assignNightCycle: 夜入→翌日夜明→翌々日 公休が望ましい)。
 *   Phase 3  日中枠を常勤 (ショ日) で先に配置 (月目標日数まで・連勤上限内・希望休尊重)。
 *   Phase 4  非常勤で午前/午後の不足を平等配分で穴埋め (PM 不足=ショ短A 終日 / AM だけ=半日A)。
 *   Phase 5  残りは公休。休業日 (必要数 0 かつ夜勤なし) は全員公休。
 *
 * 夜勤で塞がっている人 (夜入/夜明) はその日の日中候補から外す。夜明の翌日は公休が望ましい
 * セル (preferredOff) なので、その人は日中に置かず休ませる。夜勤・日中いずれも「勤務した日」
 * として連勤・出勤日数にカウントする。
 *
 * DB に触れない純粋関数。常勤/非常勤の判定や記号→DB パターンの対応・夜勤上限は呼び出し側が担う。
 * 決定論: 同じ入力なら同じ結果 (employeeCode で安定ソート、乱数は使わない)。
 */
import type { DayKind } from "@prisma/client";

import {
  countPresence,
  evaluateCoverage,
  type CoverageResult,
  type SymbolMaster,
} from "@/lib/shift/coverage";

import {
  assignNightCycle,
  DEFAULT_NIGHT_CYCLE_CONFIG,
  type NightCycleConfig,
  type NightDay,
  type NightEmployee,
} from "./night-cycle";

/** 当月の 1 日ぶん (日付と日種)。 */
export type ShortDay = {
  /** "YYYY-MM-DD" */
  date: string;
  dayKind: DayKind;
};

/** ショートの自動生成に渡す職員。 */
export type ShortEmployee = {
  id: string;
  /** 安定ソート用 (決定論)。 */
  employeeCode: string;
  /** 常勤か (正社員/契約=常勤)。 */
  isFullTime: boolean;
  /** 生活相談員か (午前/午後 各 N 名の充足チェック用。配置は強制しない)。 */
  isCounselor: boolean;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外をまとめて渡す。 */
  unavailableDates: ReadonlySet<string>;
  /** 月の目標出勤日数 (常勤のみ使用。既定 21)。これに達したら以降は公休。 */
  targetWorkDays: number;
  /** 月の夜勤上限 (0 = 夜勤不可)。shift_constraints.max_night_shifts_per_month 由来。 */
  nightCap: number;
  /** 夜勤希望の日 ("YYYY-MM-DD")。夜勤割当でその日を優先する。 */
  preferredNightDates: ReadonlySet<string>;
};

/** 1 日種ぶんの配置基準 (午前/午後 + 相談員 + 夜入)。office_coverage_demands 由来。 */
export type ShortDemand = {
  am: number;
  pm: number;
  counselorAm: number;
  counselorPm: number;
  /** その日に必要な夜入の数 (ショートは 1)。 */
  nightIn: number;
};

/** 使用する勤務記号と上限。 */
export type ShortConfig = {
  maxConsecutiveDays: number;
  symbols: {
    /** 常勤の終日 (例: ショ日)。 */
    fullDay: string;
    /** 非常勤の終日 (例: ショ短A)。PM 不足時に使う。 */
    partFullDay: string;
    /** 非常勤の午前 (例: 半日A)。AM だけ不足時に使う。 */
    partAm: string;
    /** 公休 (例: 公休)。 */
    off: string;
  };
  night: NightCycleConfig;
};

export const SHORT_DEFAULT_CONFIG: ShortConfig = {
  maxConsecutiveDays: 6,
  symbols: { fullDay: "ショ日", partFullDay: "ショ短A", partAm: "半日A", off: "公休" },
  night: DEFAULT_NIGHT_CYCLE_CONFIG,
};

export const SHORT_DEFAULT_TARGET_WORK_DAYS = 21;

export type GenerateShortInput = {
  days: ReadonlyArray<ShortDay>;
  employees: ReadonlyArray<ShortEmployee>;
  /** 日種ごとの配置基準。無い日種・必要数 0 の日種は休業日扱い。 */
  demandByDayKind: Partial<Record<DayKind, ShortDemand>>;
  /** 記号 → 午前/午後カウント (ShiftPattern.am/pm_count 由来)。 */
  master: SymbolMaster;
  config?: ShortConfig;
};

/** 1 セルの割当 (公休・夜入・夜明も含む)。 */
export type ShortAssignment = {
  employeeId: string;
  date: string;
  baseSymbol: string;
};

/** 1 日の結果 (過不足の可視化用)。 */
export type ShortDayResult = {
  date: string;
  dayKind: DayKind;
  operating: boolean;
  /** その日 夜入を 1 名以上置けたか (夜勤の必要がある日のみ意味を持つ)。 */
  nightFilled: boolean;
  /** その日の午前/午後在席・相談員充足など (休業日は null)。 */
  coverage: CoverageResult | null;
};

export type GenerateShortResult = {
  /** 全職員 × 全日 のセル (夜入/夜明/日中勤務/公休)。 */
  assignments: ShortAssignment[];
  days: ShortDayResult[];
  /** 職員ごとの出勤日数 (夜勤・日中を含む。公休除く)。 */
  workDaysByEmployee: Record<string, number>;
  /** 職員ごとの夜勤回数 (夜入の数)。 */
  nightCountByEmployee: Record<string, number>;
  /** 夜入を 1 名も置けなかった日 (人員不足。最重要警告)。 */
  unfilledNightDays: string[];
};

function isOperating(demand: ShortDemand | undefined): demand is ShortDemand {
  return !!demand && demand.am + demand.pm > 0;
}

export function generateShort(input: GenerateShortInput): GenerateShortResult {
  const config = input.config ?? SHORT_DEFAULT_CONFIG;
  const employees = [...input.employees].sort((a, b) =>
    a.employeeCode.localeCompare(b.employeeCode),
  );
  const fullTimers = employees.filter((e) => e.isFullTime);
  const partTimers = employees.filter((e) => !e.isFullTime);
  const counselorIds = new Set(employees.filter((e) => e.isCounselor).map((e) => e.id));

  // ── Phase 2: 夜勤を先取り ───────────────────────────────────────────────
  const nightDays: NightDay[] = input.days.map((d) => ({
    date: d.date,
    nightInRequired: input.demandByDayKind[d.dayKind]?.nightIn ?? 0,
  }));
  const nightEmployees: NightEmployee[] = employees.map((e) => ({
    preferredNightDates: e.preferredNightDates,
    id: e.id,
    employeeCode: e.employeeCode,
    nightCap: e.nightCap,
    unavailableDates: e.unavailableDates,
  }));
  const night = assignNightCycle(nightDays, nightEmployees, config.night);

  // 夜セルを引きやすい形に: "employeeId|date" -> baseSymbol
  const nightCellByKey = new Map<string, string>();
  for (const a of night.assignments) {
    nightCellByKey.set(`${a.employeeId}|${a.date}`, a.baseSymbol);
  }

  // ── Phase 3〜5: 日中を埋める (デイと同じ。ただし夜勤セルを尊重) ────────────
  const workDays = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const consecutive = new Map<string, number>(employees.map((e) => [e.id, 0]));

  const assignments: ShortAssignment[] = [];
  const dayResults: ShortDayResult[] = [];

  for (const day of input.days) {
    const demand = input.demandByDayKind[day.dayKind];
    const operating = isOperating(demand);
    const occupiedByNight = night.occupiedByDate.get(day.date) ?? new Set<string>();

    // その日の割当 (夜勤セル含む)。employeeId -> 勤務記号。
    const today = new Map<string, string>();
    for (const e of employees) {
      const nightSymbol = nightCellByKey.get(`${e.id}|${day.date}`);
      if (nightSymbol) today.set(e.id, nightSymbol);
    }

    if (operating) {
      // 夜勤で塞がっている / 連勤上限 / 不可日 / 夜明の翌日 (公休が望ましい) は日中に置かない。
      const eligible = (e: ShortEmployee): boolean =>
        !occupiedByNight.has(e.id) &&
        !today.has(e.id) &&
        !e.unavailableDates.has(day.date) &&
        !night.preferredOff.has(`${e.id}|${day.date}`) &&
        consecutive.get(e.id)! < config.maxConsecutiveDays;

      // Phase 3: 常勤を ショ日 で配置 (相談員優先 → 目標残り多い順 → 累計少ない順)。
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

      // Phase 4: 非常勤で午前/午後不足を平等配分で穴埋め。
      // 累計出勤が最も少ない人から、PM 不足なら終日(ショ短A)、AM だけ不足なら午前(半日A)。
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

    // セル出力 + 状態更新。勤務した人 (夜勤含む) は出勤+連勤++、それ以外は公休で連勤リセット。
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

    const nightNeeded = (demand?.nightIn ?? 0) > 0;
    const nightFilled = nightNeeded ? !night.unfilledNightDays.includes(day.date) : true;
    dayResults.push({ date: day.date, dayKind: day.dayKind, operating, nightFilled, coverage });
  }

  return {
    assignments,
    days: dayResults,
    workDaysByEmployee: Object.fromEntries(workDays),
    nightCountByEmployee: night.nightCountByEmployee,
    unfilledNightDays: night.unfilledNightDays,
  };
}

function toAssignments(today: Map<string, string>): { employeeId: string; baseSymbol: string }[] {
  return [...today.entries()].map(([employeeId, baseSymbol]) => ({ employeeId, baseSymbol }));
}
