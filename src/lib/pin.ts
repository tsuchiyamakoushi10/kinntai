/**
 * 共有タブレット打刻用の 4 桁暗証番号 (PIN) のハッシュ / 検証。
 *
 * 通常のログインパスワードと同じ bcrypt を使う（コスト 12）。総当たりは
 * 10^4 = 1 万通りしかなく短時間で全パターン試せてしまうため、上位レイヤー
 * で連続失敗時のロックアウト等のレート制御も必要。
 *
 * users.pin_code_hash に NULL を保存している従業員はタブレット打刻不可。
 */
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export class InvalidPinFormatError extends Error {
  constructor() {
    super("PIN は 4 桁の数字で指定してください。");
    this.name = "InvalidPinFormatError";
  }
}

const PIN_PATTERN = /^\d{4}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) throw new InvalidPinFormatError();
  return bcrypt.hash(pin, BCRYPT_COST);
}

export async function verifyPin(pin: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  if (!isValidPinFormat(pin)) return false;
  return bcrypt.compare(pin, hash);
}
