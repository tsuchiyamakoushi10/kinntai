/**
 * 職員ログイン用 ID / 初期パスワードの自動発行ロジック。
 *
 * 介護職員はメールアドレスを持たない / 使わないことが多いため、メールに依らず
 * ログインできるよう、従業員コード由来の短い loginId と読みやすい初期パスワードを
 * 管理画面から一括発行する。発行した平文パスワードは DB に保存せず、発行直後の
 * 画面で一度だけ管理者に提示し、本人へ手渡してもらう運用。
 *
 * ハッシュ化は `@/lib/password` の `hashPassword` を使う（このモジュールは純粋
 * ロジックのみに保ち、DB / bcrypt 依存を持ち込まない）。
 */
import { randomInt } from "node:crypto";

/**
 * 従業員コード ("E0001" 等) から既定の loginId を導く。
 *
 * 単純に小文字化するだけ ("e0001")。短く・一意・安定で、口頭やメモで伝えやすい。
 * 想定外フォーマットでも壊れないよう、英数字以外は除去する。
 */
export function loginIdFromEmployeeCode(employeeCode: string): string {
  const normalized = employeeCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized || "user";
}

/**
 * loginId の重複を避けて確定する。
 *
 * `base` がすでに使われている場合は "-2", "-3" … と連番を付与して空きを探す。
 * `isTaken` には DB 照会など「その loginId が既存か」を返す述語を渡す。
 */
export async function resolveUniqueLoginId(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // 現実にはここへ到達しない（同一コード基底が 999 個衝突する状況は無い）。
  throw new Error(`loginId の空きが見つかりませんでした: ${base}`);
}

// 紛らわしい文字 (0/O, 1/l/I) を除いた英数字。高齢の職員が紙のメモから
// 入力する前提で、誤読しにくい集合にする。
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const INITIAL_PASSWORD_LENGTH = 8;

/**
 * 読みやすい初期パスワードを生成する（既定 8 桁）。
 *
 * 暗号的に安全な乱数 (`crypto.randomInt`) を使い、紛らわしい文字を避ける。
 * mustChangePassword=true 運用のため、本人が初回ログイン後に必ず変更する。
 */
export function generateInitialPassword(length: number = INITIAL_PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}
