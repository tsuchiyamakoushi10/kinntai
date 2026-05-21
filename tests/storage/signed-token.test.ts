import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  SIGNED_URL_TTL_SECONDS,
  createSignedToken,
  verifySignedToken,
} from "@/lib/storage/signed-token";

const ORIGINAL_SECRET = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-prod";
});

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("createSignedToken / verifySignedToken", () => {
  it("発行直後のトークンは検証できる", () => {
    const now = Date.parse("2026-05-21T10:00:00Z");
    const token = createSignedToken("doc-1", { now });
    const result = verifySignedToken(token, now + 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.documentId).toBe("doc-1");
      expect(result.expiresAtSec).toBe(Math.floor(now / 1000) + SIGNED_URL_TTL_SECONDS);
    }
  });

  it("TTL を超えたトークンは expired と判定する", () => {
    const now = Date.parse("2026-05-21T10:00:00Z");
    const token = createSignedToken("doc-1", { now, ttlSeconds: 60 });
    const result = verifySignedToken(token, now + 61_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("署名部の改ざんは bad_signature で弾く", () => {
    const now = Date.parse("2026-05-21T10:00:00Z");
    const token = createSignedToken("doc-1", { now });
    const parts = token.split(".");
    const payload = parts[0]!;
    const sig = parts[1]!;
    // 末尾を別の英数字に差し替える
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const tampered = `${payload}.${flipped}`;
    const result = verifySignedToken(tampered, now + 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("別の secret で署名されたトークンは弾く", () => {
    const now = Date.parse("2026-05-21T10:00:00Z");
    process.env.AUTH_SECRET = "secret-A";
    const token = createSignedToken("doc-1", { now });
    process.env.AUTH_SECRET = "secret-B";
    const result = verifySignedToken(token, now + 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("フォーマット不正は malformed", () => {
    const result = verifySignedToken("not-a-token", Date.now());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("documentId にコロンを含む UUID 風文字列でも往復できる (区切りは最後のコロン)", () => {
    const now = Date.parse("2026-05-21T10:00:00Z");
    const id = "11111111-2222-3333-4444-555555555555";
    const token = createSignedToken(id, { now });
    const result = verifySignedToken(token, now + 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.documentId).toBe(id);
  });
});
