/**
 * 管理者 (施設管理者) の事務日 / 実績周り日 の共有定義。
 *
 * 管理者は希望休と同じ提出画面で「事務日」「実績周り日」を日付指定し、自動生成では
 * その日を下記の勤務記号で固定配置して公休を入れない (デイ / ショート / NRS に適用)。
 * 記号名は勤務記号マスター (ShiftPattern.name) と一致させる (prisma/seeds/master.ts)。
 */
import type { ShiftPreferenceType } from "@prisma/client";

/** 事務日に貼る勤務記号名 (ShiftPattern.name)。 */
export const MANAGER_OFFICE_SYMBOL = "事務";
/** 実績周り日に貼る勤務記号名 (ShiftPattern.name)。 */
export const MANAGER_ROUND_SYMBOL = "実績周り";

/** 管理者が 1 か月に指定できる事務日の上限 (目標)。 */
export const MANAGER_MONTHLY_OFFICE_DAYS = 2;
/** 管理者が 1 か月に指定できる実績周り日の上限 (目標)。 */
export const MANAGER_MONTHLY_ROUND_DAYS = 1;

/** 管理者だけが提出できる希望種別 (事務日 / 実績周り日)。 */
export const MANAGER_DUTY_PREFERENCE_TYPES: ReadonlyArray<ShiftPreferenceType> = [
  "OFFICE_DAY",
  "RECORD_ROUND",
];

/** 希望種別 → 貼る勤務記号名。管理者向けの事務日 / 実績周り日のみ対応。 */
export function managerDutySymbolFor(type: ShiftPreferenceType): string | null {
  if (type === "OFFICE_DAY") return MANAGER_OFFICE_SYMBOL;
  if (type === "RECORD_ROUND") return MANAGER_ROUND_SYMBOL;
  return null;
}
