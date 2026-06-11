/**
 * 希望休カレンダー一括入力で、管理側 (代理) と職員側 (本人) の双方が共有する型・定数。
 *
 * カレンダー UI コンポーネント (`@/components/bulk-off-calendar`) と、各 Server Action
 * (`admin/shift-preferences/actions.ts` / `me/shift-preferences/actions.ts`) から参照する。
 */

export type BulkOffFormState = {
  error?: string;
  saved?: number;
};

/** 夜勤のある拠点コード。これらの拠点だけ「夜勤希望」をカレンダーに出す。 */
export const NIGHT_OFFICE_CODES: ReadonlySet<string> = new Set(["SHO-CENTER", "NRS-CENTER"]);
