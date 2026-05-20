/**
 * 共有タブレット打刻フロー用のセッション管理。
 *
 * 通常の Auth.js ログインとは別軸の、2 種類の HMAC 署名付き Cookie を扱う:
 *
 *   - `kinntai_tablet_office` : 端末が登録された拠点 ID（長期、デフォルト 365 日）。
 *     S-T-01 の初期セットアップで管理者が発行する。
 *   - `kinntai_tablet_pin`    : 暗証番号を通った直後の従業員 ID（短期、30 秒）。
 *     S-T-03 → S-T-04 → S-T-05 の遷移中だけ有効。打刻後は即破棄。
 *
 * Cookie が改ざんされても他人の打刻に化けないよう、AUTH_SECRET を鍵に HMAC-SHA256
 * で署名する。署名検証で落ちたら未認証扱い。
 *
 * すべて Node ランタイム前提（middleware からは触らない）。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const OFFICE_COOKIE = "kinntai_tablet_office";
const PIN_COOKIE = "kinntai_tablet_pin";

// PIN 認証 cookie の有効期間 (ms)。打刻メニューで迷っている時間も含むため
// 短すぎないが、放置端末からの誤打刻を防ぐ程度には短く。
const PIN_TTL_MS = 30_000;

// 拠点 cookie のデフォルト有効期間 (秒)。.env で上書き可。
const DEFAULT_OFFICE_TTL_SEC = 60 * 60 * 24 * 365;

type OfficePayload = { v: "office"; o: string; iat: number };
type PinPayload = { v: "pin"; e: string; x: number };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET is not configured (must be set for tablet session)");
  }
  return s;
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function sign(payload: object): string {
  const body = b64urlEncode(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64urlEncode(mac)}`;
}

function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(body).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  try {
    return JSON.parse(b64urlDecode(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function cookieSecure(): boolean {
  // .env で明示。production では強制的に true（Auth.js 設定と合わせる）。
  return process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "true";
}

function officeTtlSec(): number {
  const raw = process.env.TABLET_SESSION_MAX_AGE;
  if (!raw) return DEFAULT_OFFICE_TTL_SEC;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_OFFICE_TTL_SEC;
}

// =============================================================================
// 拠点登録 cookie
// =============================================================================

/** 端末を指定拠点に紐づける（S-T-01 セットアップ完了時に呼ぶ）。 */
export async function setTabletOffice(officeId: string): Promise<void> {
  const token = sign({ v: "office", o: officeId, iat: Date.now() } satisfies OfficePayload);
  const jar = await cookies();
  jar.set(OFFICE_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/tablet",
    maxAge: officeTtlSec(),
  });
}

/** 端末の拠点登録を解除。`/tablet/setup` のリセット導線で使う。 */
export async function clearTabletOffice(): Promise<void> {
  const jar = await cookies();
  jar.delete(OFFICE_COOKIE);
}

/** 端末に紐づく拠点 ID を返す。未登録 / 改ざん検出時は null。 */
export async function getTabletOfficeId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(OFFICE_COOKIE)?.value;
  const payload = verify<OfficePayload>(raw);
  if (!payload || payload.v !== "office") return null;
  return payload.o;
}

// =============================================================================
// PIN 認証 cookie
// =============================================================================

/** PIN 検証 OK 時に発行（S-T-03 → S-T-04）。30 秒で失効。 */
export async function setTabletPinSession(employeeId: string): Promise<void> {
  const token = sign({
    v: "pin",
    e: employeeId,
    x: Date.now() + PIN_TTL_MS,
  } satisfies PinPayload);
  const jar = await cookies();
  jar.set(PIN_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/tablet",
    // maxAge は ms ではなく秒。少し余裕を持たせるが、実体の判定は exp で行う。
    maxAge: Math.ceil(PIN_TTL_MS / 1000) + 5,
  });
}

/** 打刻完了時に必ず消す。次の打刻で再度 PIN を求めるため。 */
export async function clearTabletPinSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(PIN_COOKIE);
}

/** PIN cookie が有効な間だけ employeeId を返す。期限切れ / 改ざんなら null。 */
export async function getTabletPinEmployeeId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(PIN_COOKIE)?.value;
  const payload = verify<PinPayload>(raw);
  if (!payload || payload.v !== "pin") return null;
  if (Date.now() > payload.x) return null;
  return payload.e;
}

export const TABLET_PIN_TTL_MS = PIN_TTL_MS;
