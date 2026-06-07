/**
 * デイサービス梨花 (DAY-RIKKA) のシフト自動生成 設定 (rika_config)。
 *
 * 設計方針 (docs の梨花設計書 §0/§2):
 *   - 事業所固有のルール (営業日 / 配置基準 / 勤務記号) はコードに直書きせず、
 *     この設定ファイルに集約する。将来ショート・デイ・ナーシングへ展開する際は
 *     同形の設定を差し替えるだけで対応できる構造にする。
 *   - 既存の汎用シフト基盤 (ShiftPattern / Shift / ShiftGenerationRun など) を壊さず
 *     再利用する。本設定は「既存 ShiftPattern.code」を参照する形で繋ぎ込む。
 *
 * 注意: 勤務記号 (symbol) は既存 prisma/seeds/master.ts の ShiftPattern.code を指す。
 *   日勤=DAY_CARE, 梨2..5=RK_2..RK_5, 半日F=HALF_F, 半午=HALF_PM,
 *   公=OFF, 有=PAID_LEAVE, 希望休=REQUESTED_OFF。
 */

/** 梨花拠点の Office.code (DB 上の正式コード。CSV の「RIKA」はこの値に対応)。 */
export const RIKA_OFFICE_CODE = "DAY-RIKKA";

/** CSV (社員マスター) 上の拠点コード表記。DB の RIKA_OFFICE_CODE と対応する。 */
export const RIKA_MASTER_OFFICE_CODE = "RIKA";

/**
 * 営業日 (曜日)。0=日 .. 6=土。
 * 梨花は 月・火・木・金 営業。水・土・日は休業 (= 全員公休)。
 * 今後水曜を開ける可能性があるため、ここを変えるだけで切り替えられる。
 */
export const RIKA_BUSINESS_DOW: ReadonlyArray<number> = [1, 2, 4, 5];

/** 配置基準: 午前 / 午後 それぞれの必要人数。 */
export const RIKA_STAFFING = { morning: 2, afternoon: 2 } as const;

/** 連勤上限 (これ以上は配置を避ける)。 */
export const RIKA_MAX_CONSECUTIVE_DAYS = 6;

/** 正社員の月間勤務日数の目安 (公休 9 日 → 勤務 21 日)。 */
export const RIKA_FULLTIME_TARGET_WORKDAYS = 21;

/** 希望休の枠 (これを超えると警告。ブロックはしない)。 */
export const RIKA_REQUEST_OFF_QUOTA = { fullTime: 3, partTime: 5 } as const;

/**
 * 勤務記号の午前 / 午後カウント定義。
 * key は既存 ShiftPattern.code。am/pm は配置基準への寄与人数 (0 or 1)。
 */
export type RikaSymbol = {
  /** 既存 ShiftPattern.code。 */
  patternCode: string;
  /** 設計書 / シフト表での表示名。 */
  label: string;
  /** 午前の頭数への寄与 (0 or 1)。 */
  am: 0 | 1;
  /** 午後の頭数への寄与 (0 or 1)。 */
  pm: 0 | 1;
  /** 休み系 (公 / 有 / 希望休) は勤務としてカウントしない。 */
  isOff?: boolean;
};

export const RIKA_SYMBOLS = {
  DAY_CARE: { patternCode: "DAY_CARE", label: "日勤", am: 1, pm: 1 },
  RK_3: { patternCode: "RK_3", label: "梨3", am: 1, pm: 1 },
  RK_4: { patternCode: "RK_4", label: "梨4", am: 1, pm: 1 },
  RK_5: { patternCode: "RK_5", label: "梨5", am: 1, pm: 1 },
  HALF_F: { patternCode: "HALF_F", label: "半日F", am: 1, pm: 0 },
  RK_2: { patternCode: "RK_2", label: "梨2", am: 1, pm: 0 },
  HALF_PM: { patternCode: "HALF_PM", label: "半午", am: 0, pm: 1 },
  OFF: { patternCode: "OFF", label: "公", am: 0, pm: 0, isOff: true },
  PAID_LEAVE: { patternCode: "PAID_LEAVE", label: "有", am: 0, pm: 0, isOff: true },
  REQUESTED_OFF: {
    patternCode: "REQUESTED_OFF",
    label: "希",
    am: 0,
    pm: 0,
    isOff: true,
  },
} as const satisfies Record<string, RikaSymbol>;

export type RikaSymbolCode = keyof typeof RIKA_SYMBOLS;

/**
 * 勤務記号の定義を取得する。
 * RIKA_SYMBOLS は satisfies でキー集合を保つ代わりに各要素の型が狭くなるため、
 * RikaSymbol 型で受け直して isOff など任意プロパティへ安全にアクセスできるようにする。
 */
export function symbolDef(code: RikaSymbolCode): RikaSymbol {
  return RIKA_SYMBOLS[code];
}

/** 終日系 (午前 + 午後の両方を埋める勤務)。正社員はここを優先配置する。 */
export const RIKA_FULLDAY_SYMBOLS: ReadonlyArray<RikaSymbolCode> = [
  "DAY_CARE",
  "RK_3",
  "RK_4",
  "RK_5",
];

// =============================================================================
// 職員ロスター (梨花の確定メンバー 6 名)
// =============================================================================
//
// 設計書の記載を正とする (2026-06-03 オーナー確認)。
// 配置可能な勤務記号 / 勤務形態 / 目安勤務日数は、将来マスター側の項目にするが、
// まずはこの設定に持たせる。氏名は社員マスター (CSV) と突き合わせて解決する
// (src/lib/shift/rika/members.ts)。CSV と食い違う点は解決時に注記として surface する。

export type RikaEmploymentClass = "full" | "part";

export type RikaRosterMember = {
  /** 氏名 (設計書表記)。社員マスターとの突合キー。 */
  name: string;
  /** 勤務形態。希望休枠・配置優先で使う。 */
  employmentClass: RikaEmploymentClass;
  /** 職種 (表示用)。enum ではなく日本語ラベルで保持。 */
  jobLabel: string;
  /** 配置可能な勤務記号 (ShiftPattern.code)。 */
  allowedSymbols: ReadonlyArray<RikaSymbolCode>;
  /** 午前のみ勤務可 (益子: 8:45-13:00)。 */
  amOnly?: boolean;
  /** 午後のみ勤務可 (木下: 午前は本庄ナーシング)。 */
  pmOnly?: boolean;
  /** 兼務応援 (主たる勤務先は別事業所。梨花には応援で来る)。 */
  isHelper?: boolean;
  /** 月間勤務日数の目安 (正社員のみ)。 */
  targetWorkDays?: number;
  /** 補足メモ。 */
  note?: string;
};

const ALL_RIKA_SYMBOLS: ReadonlyArray<RikaSymbolCode> = [
  ...RIKA_FULLDAY_SYMBOLS,
  "HALF_F",
  "RK_2",
  "HALF_PM",
];

export const RIKA_ROSTER: ReadonlyArray<RikaRosterMember> = [
  {
    name: "五木田秀美",
    employmentClass: "full",
    jobLabel: "生活相談員",
    allowedSymbols: RIKA_FULLDAY_SYMBOLS,
    targetWorkDays: RIKA_FULLTIME_TARGET_WORKDAYS,
    note: "月21日勤務が目安",
  },
  {
    name: "菅原知美",
    employmentClass: "part",
    jobLabel: "介護",
    allowedSymbols: ALL_RIKA_SYMBOLS,
  },
  {
    name: "須永加寿美",
    employmentClass: "part",
    jobLabel: "介護",
    allowedSymbols: ALL_RIKA_SYMBOLS,
  },
  {
    name: "益子紗生里",
    employmentClass: "part",
    jobLabel: "介護",
    allowedSymbols: ["HALF_F"],
    amOnly: true,
    note: "午前のみ (8:45-13:00)",
  },
  {
    name: "横野千波",
    employmentClass: "part",
    jobLabel: "介護",
    allowedSymbols: ["DAY_CARE", "RK_3", "RK_5", "HALF_F", "HALF_PM"],
    isHelper: true,
    note: "主はデイ結い (DEY)。梨花は応援",
  },
  {
    name: "木下潤平",
    employmentClass: "full",
    jobLabel: "柔整師",
    allowedSymbols: ["HALF_PM"],
    pmOnly: true,
    isHelper: true,
    note: "午後のみ。午前は本庄ナーシング",
  },
];
