import { describe, expect, it } from "vitest";

import { canRenderContract } from "@/lib/employment-contract/validation";

const baseContract = {
  workplaceInitial: "ショートステイ結いの心",
  workplaceScope: "会社が運営する全事業所",
  jobDescriptionInitial: "介護業務",
  jobDescriptionScope: "変更なし",
  weeklyHoursCategory: "BETWEEN_30_40" as const,
  contractEndOn: null,
  isRenewable: false,
  renewalCriteria: null,
};

describe("canRenderContract", () => {
  it("必須項目がすべて埋まっていれば ok", () => {
    const r = canRenderContract({
      contract: baseContract,
      companyProfile: { id: "c-1" },
    });
    expect(r.ok).toBe(true);
  });

  it("会社マスタが無ければエラー", () => {
    const r = canRenderContract({
      contract: baseContract,
      companyProfile: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.some((m) => m.includes("会社情報"))).toBe(true);
    }
  });

  it("就業場所が空ならエラー", () => {
    const r = canRenderContract({
      contract: { ...baseContract, workplaceInitial: "" },
      companyProfile: { id: "c-1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("就業の場所 (雇入直後)");
    }
  });

  it("変更の範囲が空ならエラー (2024 年改正)", () => {
    const r = canRenderContract({
      contract: { ...baseContract, workplaceScope: "" },
      companyProfile: { id: "c-1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("就業の場所 (変更の範囲)");
    }
  });

  it("業務内容が空ならエラー", () => {
    const r = canRenderContract({
      contract: {
        ...baseContract,
        jobDescriptionInitial: "",
        jobDescriptionScope: "",
      },
      companyProfile: { id: "c-1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("従事すべき業務 (雇入直後)");
      expect(r.missing).toContain("従事すべき業務 (変更の範囲)");
    }
  });

  it("週所定区分が未設定ならエラー", () => {
    const r = canRenderContract({
      contract: { ...baseContract, weeklyHoursCategory: null },
      companyProfile: { id: "c-1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("週所定労働時間区分");
    }
  });
});
