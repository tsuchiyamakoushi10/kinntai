import { describe, expect, it } from "vitest";

import type { ConsumptionInput, GrantInput } from "@/lib/leave/balance";
import { evaluateFiveDayRule } from "@/lib/leave/five-day-rule";

const G10: GrantInput = {
  id: "g10",
  grantedOn: "2025-04-01",
  expiresOn: "2027-04-01",
  grantedDays: 10,
};
const G7: GrantInput = {
  id: "g7",
  grantedOn: "2025-04-01",
  expiresOn: "2027-04-01",
  grantedDays: 7,
};

function c(consumedOn: string, days = 1): ConsumptionInput {
  return { consumedOn, consumedDays: days };
}

describe("evaluateFiveDayRule", () => {
  it("10 日未満の付与は対象外", () => {
    const r = evaluateFiveDayRule([G7], [], "2025-06-01");
    expect(r).toEqual([]);
  });

  it("付与直後 (期限まで > 3 か月) で消化ゼロは watch", () => {
    const r = evaluateFiveDayRule([G10], [], "2025-04-15");
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe("watch");
    expect(r[0]?.shortBy).toBe(5);
  });

  it("ウィンドウ内に 5 日取得済みなら ok", () => {
    const cs = ["2025-04-05", "2025-05-05", "2025-06-05", "2025-07-05", "2025-08-05"].map((d) =>
      c(d),
    );
    const r = evaluateFiveDayRule([G10], cs, "2025-09-01");
    expect(r[0]?.severity).toBe("ok");
    expect(r[0]?.consumedInWindow).toBe(5);
    expect(r[0]?.shortBy).toBe(0);
  });

  it("ウィンドウ外 (1 年経過後) の消化はカウントされない", () => {
    // 2026-04-15 は付与日 + 1 年を過ぎたウィンドウ外
    const r = evaluateFiveDayRule([G10], [c("2026-04-15", 5)], "2026-05-01");
    expect(r[0]?.consumedInWindow).toBe(0);
  });

  it("期限を過ぎて 5 日未達は violated", () => {
    const r = evaluateFiveDayRule([G10], [c("2025-05-01", 2)], "2026-04-15");
    expect(r[0]?.severity).toBe("violated");
    expect(r[0]?.shortBy).toBe(3);
    expect(r[0]?.daysLeft).toBeLessThanOrEqual(0);
  });

  it("期限まで 3 か月以下で残数あり → warn", () => {
    // 期限 = 2026-04-01。asOf 2026-02-01 (約 59 日前) で 3 日しか消化なし
    const r = evaluateFiveDayRule([G10], [c("2025-05-01", 3)], "2026-02-01");
    expect(r[0]?.severity).toBe("warn");
    expect(r[0]?.shortBy).toBe(2);
  });

  it("半休 0.5 を合算してカウント", () => {
    const cs = Array.from({ length: 10 }, (_, i) =>
      c(`2025-05-${String(i + 1).padStart(2, "0")}`, 0.5),
    );
    const r = evaluateFiveDayRule([G10], cs, "2025-09-01");
    expect(r[0]?.consumedInWindow).toBe(5);
    expect(r[0]?.severity).toBe("ok");
  });

  it("複数付与: 古いウィンドウ内に発生した消化は古い付与に割り当てられる", () => {
    const G10b: GrantInput = {
      id: "g10b",
      grantedOn: "2026-04-01",
      expiresOn: "2028-04-01",
      grantedDays: 11,
    };
    // 2026-03-15 の消化は G10 のウィンドウ内 → G10 のカウント
    // 2026-04-10 の消化は G10b のウィンドウ内、ただし FIFO で G10 の残量が優先 (G10 はまだ残 9)
    const r = evaluateFiveDayRule(
      [G10, G10b],
      [c("2026-03-15", 1), c("2026-04-10", 1)],
      "2026-05-01",
    );
    const a = r.find((x) => x.grantId === "g10");
    const b = r.find((x) => x.grantId === "g10b");
    // G10 のウィンドウは 2025-04-01〜2026-04-01。2026-03-15 のみがウィンドウ内なので 1 日
    expect(a?.consumedInWindow).toBe(1);
    // 2026-04-10 は G10 のウィンドウ外。FIFO で G10 から消化されるが、G10 のウィンドウ内には数えない
    // → G10b のカウントも 0
    expect(b?.consumedInWindow).toBe(0);
  });

  it("未来の付与は除外", () => {
    const future: GrantInput = {
      id: "future",
      grantedOn: "2030-04-01",
      expiresOn: "2032-04-01",
      grantedDays: 10,
    };
    const r = evaluateFiveDayRule([future], [], "2025-04-15");
    expect(r).toEqual([]);
  });
});
