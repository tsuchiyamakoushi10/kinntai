import { describe, expect, it } from "vitest";

import {
  countAttentionOffices,
  evaluateCounselorCheck,
  evaluateCounselorChecks,
  type CounselorCheckInput,
} from "@/lib/shift/counselor-check";

function office(
  partial: Partial<CounselorCheckInput> & Pick<CounselorCheckInput, "officeCode">,
): CounselorCheckInput {
  return {
    officeId: `id-${partial.officeCode}`,
    officeName: `拠点 ${partial.officeCode}`,
    requiredCounselors: 0,
    counselors: [],
    ...partial,
  };
}

function counselors(...codes: string[]): CounselorCheckInput["counselors"] {
  return codes.map((c) => ({ employeeId: `id-${c}`, employeeCode: c }));
}

describe("evaluateCounselorCheck — 単一拠点", () => {
  it("必要数を満たせば ok", () => {
    const r = evaluateCounselorCheck(
      office({ officeCode: "DEY", requiredCounselors: 1, counselors: counselors("E0001") }),
    );
    expect(r.status).toBe("ok");
    expect(r.actualCounselors).toBe(1);
    expect(r.shortfall).toBe(0);
  });

  it("必要なのに 0 名なら shortage (不足数を返す)", () => {
    const r = evaluateCounselorCheck(
      office({ officeCode: "DEY", requiredCounselors: 1, counselors: counselors() }),
    );
    expect(r.status).toBe("shortage");
    expect(r.actualCounselors).toBe(0);
    expect(r.shortfall).toBe(1);
  });

  it("必要数に届かなければ shortage (2 必要・1 在籍 → 不足 1)", () => {
    const r = evaluateCounselorCheck(
      office({ officeCode: "BIG", requiredCounselors: 2, counselors: counselors("E0001") }),
    );
    expect(r.status).toBe("shortage");
    expect(r.shortfall).toBe(1);
  });

  it("不要なのに在籍していれば unexpected (厨房に相談員等の誤付け疑い)", () => {
    const r = evaluateCounselorCheck(
      office({ officeCode: "KITCHEN", requiredCounselors: 0, counselors: counselors("E0017") }),
    );
    expect(r.status).toBe("unexpected");
    expect(r.actualCounselors).toBe(1);
    expect(r.shortfall).toBe(0);
  });

  it("不要で在籍もいなければ not_required (正常)", () => {
    const r = evaluateCounselorCheck(office({ officeCode: "NH", requiredCounselors: 0 }));
    expect(r.status).toBe("not_required");
    expect(r.shortfall).toBe(0);
  });

  it("requiredCounselors が負でも 0 として扱う", () => {
    const r = evaluateCounselorCheck(office({ officeCode: "X", requiredCounselors: -3 }));
    expect(r.status).toBe("not_required");
  });
});

describe("evaluateCounselorChecks — 複数拠点", () => {
  it("拠点コード順に安定ソートして返す", () => {
    const results = evaluateCounselorChecks([
      office({ officeCode: "SHORT", requiredCounselors: 1, counselors: counselors("E0045") }),
      office({ officeCode: "DEY", requiredCounselors: 1, counselors: counselors() }),
      office({ officeCode: "KITCHEN", requiredCounselors: 0, counselors: counselors("E0017") }),
    ]);
    expect(results.map((r) => r.officeCode)).toEqual(["DEY", "KITCHEN", "SHORT"]);
    expect(results.map((r) => r.status)).toEqual(["shortage", "unexpected", "ok"]);
  });

  it("今回の本番データ相当 (デイ=shortage / 厨房=unexpected) を再現する", () => {
    const results = evaluateCounselorChecks([
      office({ officeCode: "DEY", requiredCounselors: 1, counselors: counselors() }),
      office({ officeCode: "KITCHEN", requiredCounselors: 0, counselors: counselors("E0017") }),
      office({ officeCode: "SHORT", requiredCounselors: 0, counselors: counselors("E0045") }),
    ]);
    const byCode = new Map(results.map((r) => [r.officeCode, r]));
    expect(byCode.get("DEY")!.status).toBe("shortage");
    expect(byCode.get("KITCHEN")!.status).toBe("unexpected");
    expect(countAttentionOffices(results)).toBe(3); // SHORT も不要なのに在籍 → unexpected
  });
});

describe("countAttentionOffices", () => {
  it("shortage と unexpected だけ数える", () => {
    const results = evaluateCounselorChecks([
      office({ officeCode: "A", requiredCounselors: 1, counselors: counselors("x") }), // ok
      office({ officeCode: "B", requiredCounselors: 1, counselors: counselors() }), // shortage
      office({ officeCode: "C", requiredCounselors: 0, counselors: counselors("y") }), // unexpected
      office({ officeCode: "D", requiredCounselors: 0 }), // not_required
    ]);
    expect(countAttentionOffices(results)).toBe(2);
  });
});
