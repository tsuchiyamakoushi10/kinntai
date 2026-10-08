/**
 * 労働条件通知書の区分プリセット・手当・法定の設定値。
 *
 * 法改正や最低賃金の改定で変わる値は「適用開始日つきの配列」で持ち、
 * 判定日 (契約開始日) で引く。改定時はこのファイルに行を足すだけでよい。
 * docs/labor-notice.md §3, §9 参照。
 */
import type {
  MinWage,
  NoticeEmploymentType,
  NoticeQualification,
  NoticeWorkPattern,
  PresetTexts,
} from "./types";

/** 文言の世代。文言を変えたら上げる (発行済み通知書の再描画に使う)。 */
export const TEMPLATE_VERSION = "2026.10";

export const EMPLOYMENT_TYPE_LABEL: Record<NoticeEmploymentType, string> = {
  FULL_TIME: "正社員",
  PART_TIME: "パート",
  NIGHT_ONLY: "夜勤専従",
};

export type EmploymentPreset = {
  texts: PresetTexts;
  /** 有期の既定月数。null = 期間の定めなし */
  defaultFixedTermMonths: number | null;
  convertsToIndefinite: boolean;
  defaultPatternCodes: ReadonlyArray<string>;
};

const COMMON_SCOPE = {
  // 先方回答: 異動・業務変更なし
  jobScope: "変更なし",
  workplaceScope: "変更なし",
};

export const EMPLOYMENT_PRESETS: Record<NoticeEmploymentType, EmploymentPreset> = {
  FULL_TIME: {
    texts: {
      ...COMMON_SCOPE,
      workingTimeSystem: "1か月単位の変形労働時間制（1か月を平均して週40時間以内）",
      holidays: "月9〜10日（シフト表で指定）",
      // TODO(要確認 §10-3): 看護の求人は「なし」。統一してよいか先方回答待ち
      trialPeriod: "有　入社日から3か月（試用期間中の労働条件は本書と同じ）",
      raise: "有　年1回（人事考課による）",
      bonus: "有　年2回（半期ごとの評価により、支給の有無を含め決定）",
      retirementAllowance: "有　中小企業退職金共済に加入（勤続3年経過後から掛金を積立）",
      overtime: "有（36協定の範囲内）",
      holidayWork: "有（36協定の範囲内）",
    },
    defaultFixedTermMonths: null,
    convertsToIndefinite: false,
    defaultPatternCodes: ["EARLY", "DAY", "LATE", "NIGHT"],
  },
  PART_TIME: {
    texts: {
      ...COMMON_SCOPE,
      workingTimeSystem:
        "シフト制（勤務日・勤務パターンは毎月のシフト表で通知。初回分を本書に添付）",
      holidays: "シフト表で勤務日とされた日以外の日（4週を通じ4日以上）",
      trialPeriod: null,
      raise: "有　年1回（人事考課による）",
      bonus: "有　年2回（評価により1回5万〜10万円程度。支給の有無を含め決定）",
      retirementAllowance: "無",
      overtime: "有（業務の都合により命じることがある）",
      holidayWork: null,
    },
    defaultFixedTermMonths: 6,
    convertsToIndefinite: true,
    defaultPatternCodes: ["DAY", "SHORT_DAY", "HALF_DAY"],
  },
  NIGHT_ONLY: {
    texts: {
      ...COMMON_SCOPE,
      // TODO(要確認 §10-2): 労使協定が夜勤専従も対象か先方回答待ち
      workingTimeSystem: "1か月単位の変形労働時間制（労使協定による。1か月を平均して週40時間以内）",
      holidays: "シフト表で勤務日とされた日以外の日（4週を通じ4日以上）",
      trialPeriod: null,
      raise: "無",
      bonus: "無",
      retirementAllowance: "無",
      overtime: "無",
      holidayWork: null,
    },
    // TODO(要確認 §10-1): パートと同じ「6か月後に無期」か先方回答待ち。現状は6か月ごとの有期更新
    defaultFixedTermMonths: 6,
    convertsToIndefinite: false,
    defaultPatternCodes: ["NIGHT", "SHORT_NIGHT"],
  },
};

/**
 * 通知書に載せる勤務パターン。勤務表の記号 (夜入 / 夜明 など) とは別に、
 * 書面上の「1 勤務」の単位で持つ (夜勤は 16:30〜翌8:30 の 1 行)。
 */
export const NOTICE_WORK_PATTERNS: ReadonlyArray<NoticeWorkPattern> = [
  {
    code: "EARLY",
    label: "早番",
    start: "06:30",
    end: "15:30",
    endsNextDay: false,
    breakMinutes: 60,
  },
  {
    code: "DAY",
    label: "日勤",
    start: "08:15",
    end: "17:15",
    endsNextDay: false,
    breakMinutes: 60,
  },
  {
    code: "LATE",
    label: "遅番",
    start: "10:00",
    end: "19:00",
    endsNextDay: false,
    breakMinutes: 60,
  },
  {
    code: "NIGHT",
    label: "夜勤",
    start: "16:30",
    end: "08:30",
    endsNextDay: true,
    breakMinutes: 120,
  },
  {
    code: "SHORT_NIGHT",
    label: "短縮夜勤",
    start: "19:00",
    end: "08:00",
    endsNextDay: true,
    breakMinutes: 120,
  },
  {
    code: "SHORT_DAY",
    label: "短日勤",
    start: "09:00",
    end: "16:00",
    endsNextDay: false,
    breakMinutes: 60,
  },
  {
    code: "HALF_DAY",
    label: "半日勤務",
    start: "09:00",
    end: "12:00",
    endsNextDay: false,
    breakMinutes: 0,
  },
];

/** 夜勤専従の 1 回あたり総額・深夜時間数の既定値 */
export const NIGHT_ONLY_DEFAULT_TOTAL_YEN = 20_000;
export const NIGHT_ONLY_DEFAULT_NIGHT_HOURS = 7;

/** 割増賃金率 (マスタ固定・編集不可) */
export const PREMIUM_RATES: ReadonlyArray<{ label: string; rate: string }> = [
  { label: "法定時間外（月60時間以内）", rate: "25%" },
  { label: "法定時間外（月60時間超）", rate: "50%" },
  { label: "法定休日労働", rate: "35%" },
  { label: "深夜労働（22時〜翌5時）", rate: "25%" },
];
export const OVERTIME_PREMIUM = 0.25;
export const NIGHT_PREMIUM = 0.25;

export const RENEWAL_CRITERIA_FIXED: ReadonlyArray<string> = [
  "契約期間満了時の業務量",
  "勤務成績・態度",
  "能力",
  "会社の経営状況",
  "従事している業務の進捗状況",
];
export const RENEWAL_CRITERIA_TO_INDEFINITE: ReadonlyArray<string> = [
  "勤務成績・態度",
  "能力",
  "会社の経営状況",
];

/**
 * 資格手当の既定額 (月額)。null = 金額未確定。手入力が必要。
 * TODO(要確認): 介護福祉士 (正社員) 以外の金額は根拠資料待ち。推測で埋めないこと。
 */
export const QUALIFICATION_ALLOWANCE_YEN: Record<
  "FULL_TIME" | "PART_TIME",
  Record<Exclude<NoticeQualification, "NONE">, number | null>
> = {
  FULL_TIME: { CARE_WORKER: 10_000, INITIAL_TRAINING: null, NURSE: null, ASSISTANT_NURSE: null },
  PART_TIME: { CARE_WORKER: null, INITIAL_TRAINING: null, NURSE: null, ASSISTANT_NURSE: null },
};

export const QUALIFICATION_LABEL: Record<NoticeQualification, string> = {
  NONE: "なし",
  CARE_WORKER: "介護福祉士",
  INITIAL_TRAINING: "初任者研修",
  NURSE: "正看護師",
  ASSISTANT_NURSE: "准看護師",
};

/** ひとり親手当: 子 1 人あたり月額と上限 */
export const SINGLE_PARENT_ALLOWANCE_PER_CHILD_YEN = 5_000;
export const SINGLE_PARENT_ALLOWANCE_CAP_YEN = 10_000;

/** 区分ごとに固定で印字する手当行 (帳票の文言そのまま) */
export const FIXED_ALLOWANCE_ROWS: Record<
  NoticeEmploymentType,
  ReadonlyArray<{ label: string; body: string; onlyIfWorksNight?: boolean }>
> = {
  FULL_TIME: [
    { label: "夜勤手当", body: "1回 6,000円 × 夜勤回数" },
    { label: "休日手当", body: "1日 1,000円" },
    { label: "年末年始手当", body: "1日 1,000円〜3,000円（12/30〜1/3）" },
    { label: "会議手当", body: "1回 1,000円" },
    { label: "通勤手当", body: "会社の定めによる実費" },
  ],
  PART_TIME: [
    { label: "休日手当", body: "1時間あたり 100円加算" },
    { label: "年末年始手当", body: "1日 1,000円〜3,000円（12/30〜1/3）" },
    {
      label: "夜勤手当（夜勤に入る場合）",
      body: "1回 5,000円（月6回目以降は1回 18,000円）",
      onlyIfWorksNight: true,
    },
    { label: "会議手当", body: "1回 1,000円" },
    { label: "通勤手当", body: "会社の定めによる実費" },
  ],
  NIGHT_ONLY: [{ label: "通勤手当", body: "会社の定めによる実費" }],
};

/** 最低賃金 (都道府県別・発効日つき)。改定のたびに行を足す。 */
export const MIN_WAGES: ReadonlyArray<MinWage> = [
  { prefecture: "埼玉県", yen: 1196, effectiveFrom: "2026-10-01" },
];

/**
 * 社会保険の適用拡大 (特定適用事業所) の企業規模しきい値。
 * 被保険者数がこの値以上なら週20時間以上のパートも加入対象。0 = 企業規模要件撤廃。
 */
export const SOCIAL_INSURANCE_EMPLOYER_THRESHOLDS: ReadonlyArray<{
  effectiveFrom: string;
  minEmployees: number;
}> = [
  { effectiveFrom: "2024-10-01", minEmployees: 51 },
  { effectiveFrom: "2027-10-01", minEmployees: 36 },
  { effectiveFrom: "2029-10-01", minEmployees: 21 },
  { effectiveFrom: "2032-10-01", minEmployees: 11 },
  { effectiveFrom: "2035-10-01", minEmployees: 0 },
];
/** 短時間労働者の社保加入の週所定時間要件 */
export const SOCIAL_INSURANCE_MIN_WEEKLY_HOURS = 20;
/** 月額賃金要件 (8.8万円)。 */
export const SOCIAL_INSURANCE_MIN_MONTHLY_WAGE_YEN = 88_000;
/** 賃金要件の撤廃日。施行日が未確定のため null (確定したら日付を入れる)。 */
export const SOCIAL_INSURANCE_WAGE_REQUIREMENT_ABOLISHED_ON: string | null = null;

/** 雇用保険の週所定時間要件 (2028-10 から 10 時間) */
export const EMPLOYMENT_INSURANCE_MIN_WEEKLY_HOURS: ReadonlyArray<{
  effectiveFrom: string;
  hours: number;
}> = [
  { effectiveFrom: "2010-04-01", hours: 20 },
  { effectiveFrom: "2028-10-01", hours: 10 },
];

/** 無期転換の申込権が発生する有期契約の通算月数 (労働契約法 18 条: 5 年超) */
export const INDEFINITE_CONVERSION_MONTHS = 60;

/** 1 日・1 週の法定労働時間 */
export const LEGAL_DAILY_HOURS = 8;
export const LEGAL_WEEKLY_HOURS = 40;

/** 通知書番号の接頭辞 */
export const NOTICE_NO_PREFIX = "CH";
