/**
 * 従業員管理で参照する定数。`actions.ts` は "use server" を付けるため
 * 非関数を export できない。それを分離するためのモジュール。
 */

// 新規登録時にだけ使う仮パスワード。Phase 5 のパスワードリセット導入
// までの暫定運用。登録完了画面で必ず管理者に表示し、本人へ伝えさせる。
export const DEFAULT_INITIAL_PASSWORD = "kinntai0000";
