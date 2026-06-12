/**
 * 機能フラグ。封印中の機能はここで一括 OFF にする。
 *
 * 打刻 (勤怠) は Phase 2 で着手予定。共有タブレットの設置・現場合意が前提で
 * あり、それまでは打刻まわりを封印しておく。封印対象は次の 2 系統:
 *
 * 1. UI 導線 — 従業員ホームの打刻ボタン / 勤怠リンク、社員詳細のタブレット
 *    PIN 設定、管理サイドバーの「勤怠」など。
 * 2. ルート — `/tablet`・`/me/attendance`・`/admin/attendance` を middleware で
 *    直 URL ブロック (`/` へリダイレクト)。
 *
 * Phase 2 で再開するときは、このフラグを true に戻すだけでよい。
 * 値を boolean 型で明示しているのは、リテラル false に絞られて
 * 「常に偽の条件」と lint/型に警告されるのを避けるため。
 */
export const ATTENDANCE_ENABLED: boolean = false;

/**
 * 職員ホームの「有給残数」ビュー (/me/leave) を表示するか。
 *
 * 現状この残数は運用で使っていない (有給付与の基準日・日数が未整備で、表示値が
 * 実態と合わないため)。当面は職員側の導線・直 URL を封印する。封印対象は:
 *
 * 1. UI 導線 — 従業員ホームの「有給残数を見る」リンク。
 * 2. ルート — `/me/leave` を middleware で直 URL ブロック (`/` へリダイレクト)。
 *
 * 管理側の有給管理 (/admin/leave 配下) はこのフラグの対象外。整備後に true へ戻す。
 */
export const EMPLOYEE_LEAVE_VIEW_ENABLED: boolean = false;
