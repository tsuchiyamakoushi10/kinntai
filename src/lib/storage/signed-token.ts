import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 書類ダウンロード用の短期署名トークン。
 *
 * 仕様:
 * - ペイロードは `documentId:expiresAtUnixSec`。
 * - 署名は HMAC-SHA256 (key = AUTH_SECRET)。固定 URL を画面に出さないための
 *   ワンショット URL なので、より厳格な鍵分離は本番化のタイミングで導入する。
 * - 既定 TTL は 5 分。docs/database-design.md §6 / development-plan.md §4 に準拠。
 * - URL-safe Base64 を採用し、`?token=` クエリにそのまま乗せられる形にする。
 */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

function getSigningSecret(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured; cannot sign document download tokens");
  }
  return Buffer.from(secret, "utf8");
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

export function createSignedToken(
  documentId: string,
  options: { ttlSeconds?: number; now?: number } = {},
): string {
  const ttl = options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const nowSec = Math.floor((options.now ?? Date.now()) / 1000);
  const exp = nowSec + ttl;
  const payload = `${documentId}:${exp}`;
  const sig = createHmac("sha256", getSigningSecret()).update(payload).digest();
  return `${base64UrlEncode(Buffer.from(payload, "utf8"))}.${base64UrlEncode(sig)}`;
}

export type VerifyResult =
  | { ok: true; documentId: string; expiresAtSec: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifySignedToken(token: string, now: number = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const payloadB64 = parts[0]!;
  const sigB64 = parts[1]!;

  let payload: string;
  let sig: Buffer;
  try {
    payload = base64UrlDecode(payloadB64).toString("utf8");
    sig = base64UrlDecode(sigB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", getSigningSecret()).update(payload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  const sep = payload.lastIndexOf(":");
  if (sep <= 0) return { ok: false, reason: "malformed" };
  const documentId = payload.slice(0, sep);
  const expRaw = payload.slice(sep + 1);
  const expiresAtSec = Number(expRaw);
  if (!Number.isInteger(expiresAtSec)) return { ok: false, reason: "malformed" };

  if (expiresAtSec * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, documentId, expiresAtSec };
}
