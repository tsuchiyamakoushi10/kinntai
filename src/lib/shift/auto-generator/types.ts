/**
 * 月次シフト自動作成 (Phase 1-H) の入出力型定義。
 *
 * 本モジュールは DB に触らない純粋関数として実装する (docs/auto-shift-design.md §4)。
 * Prisma 型ではなく素の値を渡せる契約にしておくことで、テストの容易さと
 * 将来のロジック差し替え (greedy → ILP など) のしやすさを担保する。
 */
import type { DayKind, EmploymentType, ShiftKind } from "@prisma/client";

// =============================================================================
// 入力
// =============================================================================

/** 自動作成対象とする従業員。Prisma の Employee + ShiftConstraint を要点だけ抽出。 */
export type EmployeeForGen = {
  id: string;
  /** 表示順安定化用。employee_code でソートする。 */
  employeeCode: string;
  employmentType: EmploymentType;
  /** 当月期間中のいずれかに在籍していれば渡す。退職日 / 入社日は当月内の不可日生成で使う。 */
  joinedOn: string; // "YYYY-MM-DD"
  /** retired は呼び出し側で除外しておく前提。on_leave は受け取るが配置候補から外す。 */
  isOnLeave: boolean;
  /** 雇用契約の所定値 (employees.weekly_work_days / daily_work_hours)。 */
  weeklyWorkDays: number;
  /** パート時給 (employment_contracts.wage_amount, 時給契約のみ)。月給は null。 */
  hourlyWageYen: number | null;
  /** 退職日 (null = 在籍中)。当月以降の日付なら不可日に反映する。 */
  retiredOn: string | null;
  /**
   * 月の夜勤希望回数 (従業員登録の項目)。Phase 2 はこの回数まで夜勤を優先割当する。
   * null / 未指定 = 希望なし (0 扱い)。夜勤は希望が無くても頭数で埋まるが、希望者が先。
   */
  desiredNightShiftsPerMonth?: number | null;
  /** 個人別シフト制約 (なければ既定値で扱う)。 */
  constraint: ShiftConstraintForGen | null;
};

export type ShiftConstraintForGen = {
  /** 月間上限分 (Phase 2 で実労働連携。MVP では参考情報)。 */
  maxMonthlyWorkMinutes: number | null;
  /** 月間夜勤上限。null = 既定 5 件として扱う (docs/auto-shift-design.md §7 論点 D)。 */
  maxNightShiftsPerMonth: number | null;
  /** 上限超過を許す (人員不足時の最終手段)。 */
  allowNightShiftOverride: boolean;
  /** 月間出勤目標日数。正社員の優先配置で使う。 */
  targetMonthlyWorkDays: number | null;
  /** 年収上限。パートの 130 万アラート用。 */
  annualIncomeCapYen: number | null;
  /** 配置不可な曜日 (0=日, 6=土)。 */
  unavailableDaysOfWeek: number[];
};

/** シフトパターン (拠点固有 + 共通)。配置対象 / 識別に使う。 */
export type PatternForGen = {
  id: string;
  code: string;
  name: string;
  shiftKind: ShiftKind;
  /** null = 全拠点共通。配置時はそのまま使える。 */
  officeId: string | null;
  /** 表示順 (パターン安定化用)。 */
  sortOrder: number;
  /** 1 シフトあたりの労働分 (休憩控除後)。年収集計用にあらかじめ計算して渡す。 */
  workMinutes: number;
  /** crosses_midnight。NIGHT_IN ペアリングに使う。 */
  crossesMidnight: boolean;
};

/** 拠点シフト枠。 */
export type QuotaForGen = {
  shiftPatternId: string;
  dayKind: DayKind;
  requiredCount: number;
};

/** 当月の (accepted な) シフト希望。 */
export type PreferenceForGen = {
  employeeId: string;
  /** "YYYY-MM-DD" */
  targetDate: string;
  /** REQUESTED_OFF / PREFERRED_NIGHT / UNAVAILABLE */
  preferenceType: "REQUESTED_OFF" | "PREFERRED_NIGHT" | "UNAVAILABLE";
};

/** 当月内に存在する既存 shifts。保護対象 (手動入力 + 過去 run の人手編集分)。 */
export type ExistingShift = {
  employeeId: string;
  workDate: string;
  shiftPatternId: string;
};

/** 前月末 NIGHT_IN の引き継ぎ用。当月 1 日に NIGHT_OUT を埋める。 */
export type PrevMonthNightIn = {
  employeeId: string;
  /** 前月最終日。当月 1 日に NIGHT_OUT を生成するための参照値。 */
  workDate: string;
};

/**
 * 拠点別のシフト自動生成 設定 (docs/auto-shift-design-v2.md §4.1)。
 * 将来 `office_shift_setting` テーブルから渡す。未指定なら DEFAULT_SHIFT_GEN_SETTING。
 */
export type ShiftGenSetting = {
  /** 連勤上限 (これ以上は配置しない)。 */
  maxConsecutiveWorkDays: number;
  /** 月の夜勤上限の既定値 (個人制約で上書き可)。 */
  defaultMaxNightShiftsPerMonth: number;
  /** パート年収上限の既定値 (個人制約で上書き可)。 */
  defaultAnnualIncomeCapYen: number;
};

export type GenerateInput = {
  officeId: string;
  /** "YYYY-MM" */
  targetMonth: string;
  /** 決定論性のための乱数シード。同じ seed なら同じ結果。 */
  seed: number;
  /** stats と shift_generation_runs.algorithm_version に記録。 */
  algorithmVersion: string;
  employees: ReadonlyArray<EmployeeForGen>;
  shiftPatterns: ReadonlyArray<PatternForGen>;
  quotas: ReadonlyArray<QuotaForGen>;
  preferences: ReadonlyArray<PreferenceForGen>;
  existingShifts: ReadonlyArray<ExistingShift>;
  prevMonthNightIn: ReadonlyArray<PrevMonthNightIn>;
  /** 当月の祝日 (src/lib/calendar/holidays.ts から渡す)。"YYYY-MM-DD"。 */
  holidays: ReadonlyArray<string>;
  /** 拠点別設定 (未指定なら既定値)。 */
  setting?: ShiftGenSetting;
};

// =============================================================================
// 出力
// =============================================================================

/** 自動作成が提案するシフト。DB に書く前段の中間表現。 */
export type ProposedShift = {
  employeeId: string;
  workDate: string;
  shiftPatternId: string;
};

/** 警告コード。docs/auto-shift-design.md §4.6 で列挙。 */
export type WarningCode =
  | "QUOTA_UNDERFILLED"
  | "QUOTA_OVERFILLED"
  | "NIGHT_SHIFT_OVER_LIMIT"
  | "NIGHT_PREF_UNMET"
  | "TARGET_WORKDAYS_UNREACHED"
  | "INCOME_CAP_EXCEEDED"
  | "UNAVAILABLE_DOW_VIOLATED"
  | "PREV_MONTH_NIGHT_HANGING"
  | "INACTIVE_PATTERN_REFERENCED";

export type Warning =
  | {
      code: "QUOTA_UNDERFILLED";
      date: string;
      shiftPatternCode: string;
      required: number;
      filled: number;
    }
  | {
      code: "QUOTA_OVERFILLED";
      date: string;
      shiftPatternCode: string;
      required: number;
      filled: number;
    }
  | {
      code: "NIGHT_SHIFT_OVER_LIMIT";
      employeeId: string;
      month: string;
      limit: number;
      assigned: number;
    }
  | {
      code: "NIGHT_PREF_UNMET";
      employeeId: string;
      month: string;
      desired: number;
      assigned: number;
    }
  | {
      code: "TARGET_WORKDAYS_UNREACHED";
      employeeId: string;
      month: string;
      target: number;
      assigned: number;
    }
  | {
      code: "INCOME_CAP_EXCEEDED";
      employeeId: string;
      year: number;
      capYen: number;
      projectedYen: number;
    }
  | {
      code: "UNAVAILABLE_DOW_VIOLATED";
      employeeId: string;
      date: string;
      dayOfWeek: number;
    }
  | {
      code: "PREV_MONTH_NIGHT_HANGING";
      employeeId: string;
      date: string;
    }
  | {
      code: "INACTIVE_PATTERN_REFERENCED";
      shiftPatternId: string;
    };

/** stats jsonb の型 (shift_generation_runs.stats に保存)。 */
export type RunStats = {
  input: {
    employees: number;
    workingDaysInMonth: number;
    holidays: ReadonlyArray<string>;
  };
  fill: {
    totalSlots: number;
    filledSlots: number;
    /** 0–1。totalSlots = 0 のときは 1。 */
    rate: number;
  };
  warnings: ReadonlyArray<Warning>;
  elapsedMs: number;
  seed: number;
};

export type GenerateOutput = {
  /** 新規 / 上書きする shifts (公休も含む)。 */
  proposedShifts: ReadonlyArray<ProposedShift>;
  /** 前回 run 由来で削除すべき (employeeId, workDate)。サーバ側で物理 delete に翻訳する。 */
  removedShifts: ReadonlyArray<{ employeeId: string; workDate: string }>;
  warnings: ReadonlyArray<Warning>;
  stats: RunStats;
};

// =============================================================================
// 既定値
// =============================================================================

/** 月間夜勤上限の既定値 (制約未設定時に適用)。 */
export const DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH = 5;
/** 連続勤務日数の上限 (これ以上は配置を強制回避)。 */
export const MAX_CONSECUTIVE_WORK_DAYS = 6;
/** パート年収上限の既定値 (制約未設定時に適用)。 */
export const DEFAULT_ANNUAL_INCOME_CAP_YEN = 1_300_000;

/** 拠点別設定の既定値 (office_shift_setting の行が無い拠点に適用)。 */
export const DEFAULT_SHIFT_GEN_SETTING: ShiftGenSetting = {
  maxConsecutiveWorkDays: MAX_CONSECUTIVE_WORK_DAYS,
  defaultMaxNightShiftsPerMonth: DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH,
  defaultAnnualIncomeCapYen: DEFAULT_ANNUAL_INCOME_CAP_YEN,
};
