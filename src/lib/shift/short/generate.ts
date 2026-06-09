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
  /** 生活相談員か。各営業日に必要数を最優先で確保する。 */
  isCounselor: boolean;
  /** 看護師 (看護職員) か。各営業日に必要数を最優先で確保する。 */
  isNurse: boolean;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外をまとめて渡す。 */
  unavailableDates: ReadonlySet<string>;
  /** 月の目標出勤日数 (常勤のみ使用。既定 21)。これに達したら以降は公休。 */
  targetWorkDays: number;
  /** 月の夜勤上限 (0 = 夜勤不可)。shift_constraints.max_night_shifts_per_month 由来。 */
  nightCap: number;
  /** 夜勤希望の日 ("YYYY-MM-DD")。夜勤割当でその日を優先する。 */
  preferredNightDates: ReadonlySet<string>;
  /** 有給の日 ("YYYY-MM-DD")。必ず休みにし、セルは有休で出す (勤務・夜勤を入れない)。 */
  paidLeaveDates: ReadonlySet<string>;
  /**
   * 固定配置の勤務記号 (毎営業日この記号で置く。null/未指定=固定なし)。
   * NH の固定番 (田中=有日勤・木下=日勤 等) に使う。固定配置者は夜勤・通常フェーズから外す。
   */
  fixedSymbol?: string | null;
};

/** 1 日種ぶんの配置基準 (午前/午後 + 相談員 + 夜入)。office_coverage_demands 由来。 */
export type ShortDemand = {
  am: number;
  pm: number;
  counselorAm: number;
  counselorPm: number;
  /** 看護師の午前/午後必要数。0 = チェックしない。 */
  nurseAm: number;
  nursePm: number;
  /** その日に必要な夜入の数 (ショートは 1)。 */
  nightIn: number;
};

/** 拠点固有の職員別上書き (氏名キー)。NH の固定配置・夜勤上限・相談員指定など。 */
export type ShortRosterOverride = {
  /** 固定配置の勤務記号 (毎営業日この記号で置く)。 */
  fixedSymbol?: string;
  /** 月の夜勤上限 (0 = 夜勤しない)。DB の shift_constraint より優先する。 */
  nightCap?: number;
  /** 生活相談員として扱う (DB の job_category が未設定でも)。 */
  isCounselor?: boolean;
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
    /** 有休 (例: 有休)。有給希望日に使う。 */
    paidLeave: string;
  };
  night: NightCycleConfig;
  /**
   * 職員別の拠点固有上書き (氏名 = Employee.lastName キー)。data 層が解決に使う。
   * 例: NH は固定配置 (fixedSymbol) と夜勤可否 (nightCap) をここで持つ。
   */
  roster?: Readonly<Record<string, ShortRosterOverride>>;
};

export const SHORT_DEFAULT_CONFIG: ShortConfig = {
  maxConsecutiveDays: 6,
  symbols: {
    fullDay: "ショ日",
    partFullDay: "ショ短A",
    partAm: "半日A",
    off: "公休",
    paidLeave: "有休",
  },
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
  const nurseIds = new Set(employees.filter((e) => e.isNurse).map((e) => e.id));

  // 正社員のペース配分用 (デイと同じ): 総営業日数と経過営業日数。
  const totalOperating = input.days.reduce(
    (n, d) => n + (isOperating(input.demandByDayKind[d.dayKind]) ? 1 : 0),
    0,
  );
  let operatingSoFar = 0;

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
    // 有給日も夜勤に入れない (希望休/勤務不可と合わせて夜勤の不可日に)。
    unavailableDates: new Set([...e.unavailableDates, ...e.paidLeaveDates]),
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
      operatingSoFar++;

      // 日勤(日中)の在席上限。必要午前人数を上限にする (MAX。これを超えて日中に置かない)。
      const dayCap = demand.am;
      let dayCount = 0; // この日に日中配置した人数 (夜勤は数えない)
      const placeDay = (e: ShortEmployee, sym: string): void => {
        today.set(e.id, sym);
        dayCount += 1;
      };

      // 月内ペース配分の理想累計 (目標×経過/総営業日)。固定配置・常勤の休み分散に使う。
      const idealWorkDaysBy = (e: ShortEmployee): number =>
        totalOperating > 0 ? Math.round((e.targetWorkDays * operatingSoFar) / totalOperating) : 0;

      // Phase 1: 固定配置 (fixedSymbol を持つ職員。NH の固定番など)。毎営業日その記号で置くが、
      // 目標日数までペース配分して公休を月内に分散し、連勤上限・不可日・希望休・有給は尊重する。
      // 夜勤は持たない前提 (roster で nightCap 0)。通常フェーズ (Phase0/3/4) からは eligible で除外。
      for (const e of employees) {
        if (!e.fixedSymbol || today.has(e.id)) continue;
        const blocked =
          e.unavailableDates.has(day.date) ||
          e.paidLeaveDates.has(day.date) ||
          consecutive.get(e.id)! >= config.maxConsecutiveDays ||
          workDays.get(e.id)! >= idealWorkDaysBy(e);
        if (blocked) continue; // 今日は休み (下のセル出力で公休/有休になる)
        placeDay(e, e.fixedSymbol);
      }

      // 夜勤で塞がっている / 連勤上限 / 不可日 / 夜明の翌日 (公休が望ましい) は日中に置かない。
      // 固定配置者 (fixedSymbol) は Phase 1 のみで扱い、通常の日中フェーズには出さない。
      const eligible = (e: ShortEmployee): boolean =>
        !e.fixedSymbol &&
        !occupiedByNight.has(e.id) &&
        !today.has(e.id) &&
        !e.unavailableDates.has(day.date) &&
        !e.paidLeaveDates.has(day.date) &&
        !night.preferredOff.has(`${e.id}|${day.date}`) &&
        consecutive.get(e.id)! < config.maxConsecutiveDays;

      // Phase 0: 相談員・看護師を必要数だけ最優先で確保 (上限内・常勤/非常勤問わず)。
      const guarantee = (need: number, pred: (e: ShortEmployee) => boolean): void => {
        if (need <= 0) return;
        const cands = employees
          .filter((e) => pred(e) && eligible(e))
          .sort((a, b) => {
            const overA = workDays.get(a.id)! >= a.targetWorkDays ? 1 : 0;
            const overB = workDays.get(b.id)! >= b.targetWorkDays ? 1 : 0;
            if (overA !== overB) return overA - overB;
            const cntA = workDays.get(a.id)!;
            const cntB = workDays.get(b.id)!;
            if (cntA !== cntB) return cntA - cntB;
            if (a.isFullTime !== b.isFullTime) return a.isFullTime ? -1 : 1;
            return a.employeeCode.localeCompare(b.employeeCode);
          });
        let placed = 0;
        for (const e of cands) {
          if (placed >= need || dayCount >= dayCap) break;
          placeDay(e, e.isFullTime ? config.symbols.fullDay : config.symbols.partFullDay);
          placed += 1;
        }
      };
      guarantee(Math.max(demand.counselorAm, demand.counselorPm), (e) => e.isCounselor);
      guarantee(Math.max(demand.nurseAm, demand.nursePm), (e) => e.isNurse);

      // Phase 3: 常勤を ショ日 で配置。月内ペース配分 (目標×経過/総営業日) を超えた人は今日は
      // 休ませる (デイと同じ)。これで休みが月内に均等分散し、月末 (6/30 等) に目標到達で
      // 一斉に休んでスカスカになるのを防ぐ。日勤上限 (dayCap) も守る。
      const ftCandidates = fullTimers
        .filter((e) => eligible(e) && !today.has(e.id) && workDays.get(e.id)! < idealWorkDaysBy(e))
        .sort((a, b) => {
          const behindA = workDays.get(a.id)! < idealWorkDaysBy(a) ? 0 : 1;
          const behindB = workDays.get(b.id)! < idealWorkDaysBy(b) ? 0 : 1;
          if (behindA !== behindB) return behindA - behindB;
          const cntA = workDays.get(a.id)!;
          const cntB = workDays.get(b.id)!;
          if (cntA !== cntB) return cntA - cntB;
          return a.employeeCode.localeCompare(b.employeeCode);
        });
      for (const e of ftCandidates) {
        if (dayCount >= dayCap) break;
        placeDay(e, config.symbols.fullDay);
      }

      // Phase 3b: ペース配分で控えた常勤でも、まだ午前/午後が不足するなら出す。
      // 「不足日があるのに常勤が休んでいる」状態を防ぐ (不足の解消をペース分散より優先)。
      // 連勤上限・夜勤・希望休・有給・日勤上限は引き続き厳守 (eligible / dayCap)。
      {
        let guard = 0;
        while (guard++ < 10_000) {
          if (dayCount >= dayCap) break;
          const present = countPresence(toAssignments(today), input.master);
          if (present.am >= demand.am && present.pm >= demand.pm) break;
          const cands = fullTimers
            .filter((e) => eligible(e) && !today.has(e.id))
            .sort((a, b) => {
              const cntA = workDays.get(a.id)!;
              const cntB = workDays.get(b.id)!;
              if (cntA !== cntB) return cntA - cntB; // 出勤の少ない人から (公平に埋める)
              return a.employeeCode.localeCompare(b.employeeCode);
            });
          if (cands.length === 0) break; // 出せる常勤が居ない → 非常勤/不足表示に委ねる
          placeDay(cands[0]!, config.symbols.fullDay);
        }
      }

      // Phase 4: 非常勤で午前/午後不足を穴埋め (日勤上限内)。
      let guard = 0;
      while (guard++ < 10_000) {
        if (dayCount >= dayCap) break;
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
        placeDay(pick, pmShort ? config.symbols.partFullDay : config.symbols.partAm);
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
              nurseAm: demand.nurseAm,
              nursePm: demand.nursePm,
            },
            (id) => counselorIds.has(id),
            (id) => nurseIds.has(id),
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
