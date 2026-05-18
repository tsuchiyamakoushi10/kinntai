/**
 * パスワードハッシュの薄いラッパー。
 *
 * 要件: bcrypt ハッシュ + ログイン試行回数制限（後者は別レイヤーで実装）。
 * cost は 12 を採用（2026 年時点の現実的なバランス。`docs/requirements.md` §5）。
 */
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
