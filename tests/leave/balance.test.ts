import { describe, expect, it } from "vitest";

import { computeBalance, type GrantInput } from "@/lib/leave/balance";

const G1: GrantInput = {
  id: "g1",
  grantedOn: "2024-04-01",
  expiresOn: "2026-04-01",
  grantedDays: 10,
};
const G2: GrantInput = {
  id: "g2",
  grantedOn: "2025-04-01",
  expiresOn: "2027-04-01",
  grantedDays: 11,
};

describe("computeBalance", () => {
  it("消化なし → 全付与が残数", () => {
    const r = computeBalance([G1, G2], [], "2025-06-01");
    expect(r.totalRemaining).toBe(21);
    expect(r.totalExpired).toBe(0);
    expect(r.totalConsumed).toBe(0);
  });

  it("古い付与から消化される (FIFO by 有効期限)", () => {
    const r = computeBalance(
      [G1, G2],
      [{ consumedOn: "2025-05-10", consumedDays: 3 }],
      "2025-06-01",
    );
    expect(r.totalRemaining).toBe(18);
    const b1 = r.perGrant.find((g) => g.id === "g1");
    const b2 = r.perGrant.find((g) => g.id === "g2");
    expect(b1?.remainingDays).toBe(7);
    expect(b2?.remainingDays).toBe(11);
  });

  it("古い付与を超える消化は次の付与へ繰り越して引かれる", () => {
    const r = computeBalance(
      [G1, G2],
      [{ consumedOn: "2025-05-10", consumedDays: 12 }],
      "2025-06-01",
    );
    expect(r.totalRemaining).toBe(9);
    expect(r.perGrant.find((g) => g.id === "g1")?.remainingDays).toBe(0);
    expect(r.perGrant.find((g) => g.id === "g2")?.remainingDays).toBe(9);
  });

  it("半日消化 (0.5) も合算される", () => {
    const r = computeBalance(
      [G1],
      [
        { consumedOn: "2025-04-10", consumedDays: 0.5 },
        { consumedOn: "2025-04-11", consumedDays: 0.5 },
      ],
      "2025-06-01",
    );
    expect(r.totalRemaining).toBe(9);
    expect(r.totalConsumed).toBe(1);
  });

  it("有効期限切れの付与残は失効に積まれ、残数に入らない", () => {
    // 2026-04-01 を過ぎた asOf で評価。G1 の残は失効、G2 のみ有効。
    const r = computeBalance(
      [G1, G2],
      [{ consumedOn: "2025-05-10", consumedDays: 2 }],
      "2026-05-01",
    );
    // G1: 10 - 2 = 8 → 失効、G2: 11 残
    expect(r.totalExpired).toBe(8);
    expect(r.totalRemaining).toBe(11);
  });

  it("消化日時点で失効済みの付与は割り当て対象外", () => {
    // G1 は 2026-04-01 失効。2026-04-15 の消化は G2 に当たる。
    const r = computeBalance(
      [G1, G2],
      [{ consumedOn: "2026-04-15", consumedDays: 3 }],
      "2026-05-01",
    );
    // G1 は丸ごと失効 (10 日)
    expect(r.totalExpired).toBe(10);
    // G2 から 3 日消化
    expect(r.perGrant.find((g) => g.id === "g2")?.remainingDays).toBe(8);
    expect(r.totalRemaining).toBe(8);
  });

  it("付与日より前の消化は割り当てられない (黙ってドロップ)", () => {
    const r = computeBalance([G2], [{ consumedOn: "2025-01-01", consumedDays: 2 }], "2025-06-01");
    expect(r.totalRemaining).toBe(11);
  });

  it("付与が複数ある場合 perGrant は expiresOn 昇順で並ぶ", () => {
    const r = computeBalance([G2, G1], [], "2025-06-01");
    expect(r.perGrant.map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});
