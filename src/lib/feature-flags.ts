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
