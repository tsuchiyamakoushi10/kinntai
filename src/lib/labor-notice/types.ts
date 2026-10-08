/**
 * 労働条件通知書 (新フォーマット 3 枚構成) の入力・マスタ・出力の型。
 *
 * docs/labor-notice.md 参照。日付はすべて JST の業務日付を "YYYY-MM-DD" 文字列で扱う
 * (Date を挟むとサーバの TZ で 1 日ずれる事故が起きるため)。
 */

/** 通知書上の雇用区分。EmploymentType (DB) とは別軸で、帳票の書き分けに使う。 */
export type NoticeEmploymentType = "FULL_TIME" | "PART_TIME" | "NIGHT_ONLY";

/** 資格 (資格手当の決定に使う)。 */
export type NoticeQualification =
  | "NONE"
  | "CARE_WORKER" // 介護福祉士
  | "INITIAL_TRAINING" // 初任者研修
  | "NURSE" // 正看護師
  | "ASSISTANT_NURSE"; // 准看護師

export type NoticeWageInput =
  | {
      kind: "MONTHLY";
      baseYen: number;
      qualification: NoticeQualification;
      /** 資格手当の月額。未指定ならマスタの既定額を使う (既定額が未確定の資格は入力必須)。 */
      qualificationAllowanceYen?: number | null;
      /** ひとり親手当の対象となる子の数 */
      singleParentChildren: number;
      managerAllowanceYen: number;
      counselorAllowanceYen: number;
    }
  | {
      kind: "HOURLY";
      hourlyYen: number;
      qualification: NoticeQualification;
      qualificationAllowanceYen?: number | null;
      /** 夜勤に入るか (入るなら夜勤手当行を出す) */
      worksNight: boolean;
    }
  | {
      kind: "NIGHT_DAILY";
      /** 1 回あたり総額 (深夜割増込み) */
      totalYen: number;
      /** 1 回あたりの深夜時間数 (22:00-翌5:00) */
      nightHours: number;
    };

export type InsuranceStatus = "ENROLLED" | "NOT_ENROLLED";

export type InsuranceSet = {
  health: InsuranceStatus;
  pension: InsuranceStatus;
  employment: InsuranceStatus;
};

/** 帳票に出す文言のうち、区分プリセットから個別に上書きできるもの。 */
export type PresetTexts = {
  workingTimeSystem: string;
  holidays: string;
  trialPeriod: string | null;
  raise: string;
  bonus: string;
  retirementAllowance: string;
  overtime: string;
  holidayWork: string | null;
  /** 業務の変更の範囲 */
  jobScope: string;
  /** 就業場所の変更の範囲 */
  workplaceScope: string;
};

/** 書面の賃金欄に載せる手当行 (文言そのまま) */
export type AllowanceRow = { label: string; body: string; onlyIfWorksNight?: boolean };

/** 資格手当の月額。null = 金額未確定 (通知書作成時に手入力が必要) */
export type QualificationAllowances = Record<Exclude<NoticeQualification, "NONE">, number | null>;

/** 区分ごとの初期値。S-A-34 で編集でき、未設定なら constants.ts の既定値 */
export type NoticePreset = {
  texts: PresetTexts;
  /** 有期の既定月数。null = 期間の定めなし */
  defaultFixedTermMonths: number | null;
  convertsToIndefinite: boolean;
  defaultPatternCodes: ReadonlyArray<string>;
  allowanceRows: ReadonlyArray<AllowanceRow>;
  qualificationAllowances: QualificationAllowances;
};

export type NoticeInput = {
  employmentType: NoticeEmploymentType;
  /** 労働者の氏名 (帳票印字用。ログには出さないこと) */
  employeeName: string;
  /** 交付日 */
  issuedOn: string;
  /** 契約開始日 */
  contractStartOn: string;
  /** 有期の契約月数。null = 期間の定めなし */
  fixedTermMonths: number | null;
  /** 満了後に無期へ切り替える (パートの初回契約) */
  convertsToIndefinite: boolean;
  /** 今回より前の、同一スタッフの有期契約の通算月数 (無期転換判定用) */
  priorFixedTermMonths: number;
  /** 定年後の再雇用による有期契約か */
  isPostRetirementRehire: boolean;
  officeId: string;
  jobDescription: string;
  wage: NoticeWageInput;
  /** 勤務パターンのコード (NoticeWorkPattern.code) */
  patternCodes: ReadonlyArray<string>;
  daysPerWeek: number;
  hoursPerWeek: number;
  /** 正社員の 1 か月平均所定労働時間 */
  monthlyHours: number | null;
  /** 週所定の補足表示 (例: "約16時間（週2日程度・月8〜9日）")。null なら hoursPerWeek から作る */
  weeklyHoursText: string | null;
  isStudent: boolean;
  /** プリセット文言の個別上書き */
  overrides: Partial<PresetTexts>;
  /** 社会保険等の手入力。null なら自動判定どおり */
  insuranceOverride: InsuranceSet | null;
};

export type NoticeCompany = {
  name: string;
  address: string;
  representative: string;
  tel: string;
  /** 社保の適用拡大判定用。null = 未設定 (判定しない) */
  employeeCount: number | null;
  hasSecondTypeCertification: boolean;
  fulltimeWeeklyHours: number;
  fulltimeMonthlyDays: number;
  variableHoursAgreementCoversNight: boolean;
  payCutoff: string;
  payDay: string;
  retirementAge: number;
  rehireUntil: number;
  rehireContinueAfter65: boolean;
  /** 求人票で「期間の定めなし」と書いている区分 */
  jobPostingIndefiniteTypes: ReadonlyArray<NoticeEmploymentType>;
};

export type NoticeOffice = {
  id: string;
  name: string;
  address: string;
  managerName: string;
  tel: string;
  prefecture: string;
};

export type NoticeWorkPattern = {
  code: string;
  label: string;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  endsNextDay: boolean;
  breakMinutes: number;
};

export type MinWage = { prefecture: string; yen: number; effectiveFrom: string };

export type NoticeMasters = {
  company: NoticeCompany;
  presets: Record<NoticeEmploymentType, NoticePreset>;
  offices: ReadonlyArray<NoticeOffice>;
  patterns: ReadonlyArray<NoticeWorkPattern>;
  minWages: ReadonlyArray<MinWage>;
};

export type NoticeIssueCode =
  | "MIN_WAGE"
  | "NIGHT_VARIABLE_HOURS"
  | "INSURANCE_MISMATCH"
  | "JOB_POSTING_TERM"
  | "POST_RETIREMENT_CERTIFICATION";

export type NoticeError = { field: string; message: string };
export type NoticeWarning = { code: NoticeIssueCode; message: string };

export type NoticePatternRow = {
  label: string;
  start: string;
  end: string;
  breakMinutes: number;
  workHours: number;
};

export type NightWageRow = {
  label: string;
  workHours: number;
  baseYen: number;
  premiumYen: number;
  hourlyYen: number;
};

/** 帳票描画用の確定値。発行時に snapshot として保存する。 */
export type NoticeView = {
  employmentType: NoticeEmploymentType;
  employmentTypeLabel: string;
  employeeName: string;
  issuedOn: string;
  company: Pick<NoticeCompany, "name" | "address" | "representative" | "tel">;
  office: Pick<NoticeOffice, "name" | "address" | "managerName" | "tel">;
  contract: {
    startOn: string;
    endOn: string | null;
    months: number | null;
    convertsToIndefinite: boolean;
    /** 無期に切り替わる日 (= 終了日の翌日) */
    conversionOn: string | null;
    renewalCriteria: ReadonlyArray<string>;
    trialPeriod: string | null;
  };
  /** 09 欄。null なら欄ごと出さない */
  indefiniteConversion:
    | { kind: "SWITCH"; switchOn: string }
    | { kind: "RIGHT"; eligible: boolean; cumulativeMonths: number }
    | null;
  jobDescription: string;
  jobScope: string;
  workplaceScope: string;
  patterns: ReadonlyArray<NoticePatternRow>;
  workingTimeSystem: string;
  monthlyHours: number | null;
  weeklyHoursText: string;
  overtime: string;
  holidayWork: string | null;
  holidays: string;
  paidLeaveDays: number;
  daysPerWeek: number;
  wage: {
    summary: string;
    rows: ReadonlyArray<{ label: string; body: string }>;
    /** 夜勤専従の 1 回あたり総額。null なら夜勤専従ではない */
    nightTotalYen: number | null;
    nightBreakdown: ReadonlyArray<NightWageRow> | null;
    nightHours: number | null;
  };
  premiumRates: ReadonlyArray<{ label: string; rate: string }>;
  payCutoff: string;
  payDay: string;
  raise: string;
  bonus: string;
  retirementAllowance: string;
  retirement: { age: number; rehireUntil: number; continueAfter65: boolean };
  insurance: InsuranceSet & { workersComp: "ENROLLED" };
  legalBasis: string;
};

export type NoticeResult = {
  view: NoticeView | null;
  errors: ReadonlyArray<NoticeError>;
  warnings: ReadonlyArray<NoticeWarning>;
};
