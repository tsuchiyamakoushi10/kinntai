/**
 * 労働条件通知書 仕様書 v0.2 §11 の受け入れテスト (プロトタイプの記入例と一致すること)。
 */
import { describe, expect, it } from "vitest";

import { initialPaidLeaveDays, round1, splitNightWage, workHours } from "@/lib/labor-notice/calc";
import { computeNotice } from "@/lib/labor-notice/compute";
import { NOTICE_WORK_PATTERNS } from "@/lib/labor-notice/constants";
import { fixedTermEndOn } from "@/lib/labor-notice/dates";
import { formatNoticeNo, nextNoticeSeq } from "@/lib/labor-notice/notice-number";

import { fullTimeInput, masters, nightOnlyInput, partTimeInput } from "./fixtures";

const pattern = (code: string) => {
  const p = NOTICE_WORK_PATTERNS.find((x) => x.code === code);
  if (!p) throw new Error(code);
  return p;
};

describe("実働時間", () => {
  it("夜勤 16:30〜翌8:30 休憩120分 → 14時間", () => {
    expect(workHours(pattern("NIGHT"))).toBe(14);
  });
  it("短縮夜勤 19:00〜翌8:00 休憩120分 → 11時間", () => {
    expect(workHours(pattern("SHORT_NIGHT"))).toBe(11);
  });
  it("半日勤務 9:00〜12:00 休憩なし → 3時間", () => {
    expect(workHours(pattern("HALF_DAY"))).toBe(3);
  });
});

describe("夜勤専従の日給の分解", () => {
  it("20,000円・実働14h・深夜7h → 基本日給17,777円 / 深夜割増2,223円 / 時間単価1,269.8円", () => {
    const r = splitNightWage(20_000, 14, 7);
    expect(r.baseYen).toBe(17_777);
    expect(r.premiumYen).toBe(2_223);
    expect(round1(r.hourlyYen)).toBe(1269.8);
  });
  it("短縮夜勤 20,000円・実働11h・深夜7h → 基本日給17,254円 / 深夜割増2,746円", () => {
    const r = splitNightWage(20_000, 11, 7);
    expect(r.baseYen).toBe(17_254);
    expect(r.premiumYen).toBe(2_746);
  });
  it("computeNotice: 最低賃金OK・内訳が書面に並ぶ", () => {
    const r = computeNotice(nightOnlyInput({ patternCodes: ["NIGHT", "SHORT_NIGHT"] }), masters());
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).not.toContain("MIN_WAGE");
    expect(r.view?.wage.nightBreakdown?.map((b) => b.baseYen)).toEqual([17_777, 17_254]);
  });
  it("変形制フラグ false → 警告「夜勤専従の変形労働時間制が未設定」(エラーではない)", () => {
    const r = computeNotice(
      nightOnlyInput(),
      masters({ variableHoursAgreementCoversNight: false }),
    );
    expect(r.errors).toEqual([]);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("NIGHT_VARIABLE_HOURS");
    expect(r.warnings.find((w) => w.code === "NIGHT_VARIABLE_HOURS")?.message).toContain(
      "夜勤専従の変形労働時間制が未設定",
    );
    // 8h 超が時間外になると 14h 夜勤は時給換算 1,159.4 円で最低賃金割れ
    expect(codes).toContain("MIN_WAGE");
  });
});

describe("最低賃金", () => {
  it("パート 時給1,195円・開始2026-11-01 → 警告「最低賃金1,196円を下回る」", () => {
    const r = computeNotice(
      partTimeInput({
        wage: { kind: "HOURLY", hourlyYen: 1195, qualification: "NONE", worksNight: false },
      }),
      masters(),
    );
    expect(r.errors).toEqual([]);
    const w = r.warnings.find((x) => x.code === "MIN_WAGE");
    expect(w?.message).toContain("最低賃金1,196円");
  });
  it("未入力 (0円) はエラーだけ出し、最低賃金の警告は重ねない", () => {
    const r = computeNotice(
      partTimeInput({
        wage: { kind: "HOURLY", hourlyYen: 0, qualification: "NONE", worksNight: false },
      }),
      masters(),
    );
    expect(r.errors.map((e) => e.field)).toContain("wage");
    expect(r.warnings.map((x) => x.code)).not.toContain("MIN_WAGE");
  });
  it("時給1,196円ならOK", () => {
    const r = computeNotice(
      partTimeInput({
        wage: { kind: "HOURLY", hourlyYen: 1196, qualification: "NONE", worksNight: false },
      }),
      masters(),
    );
    expect(r.warnings.map((x) => x.code)).not.toContain("MIN_WAGE");
  });
  it("最低賃金の改定前 (2026-09-30 開始) は新しい額で判定しない", () => {
    const r = computeNotice(
      partTimeInput({
        contractStartOn: "2026-09-30",
        wage: { kind: "HOURLY", hourlyYen: 1100, qualification: "NONE", worksNight: false },
      }),
      masters(),
    );
    expect(r.warnings.map((x) => x.code)).not.toContain("MIN_WAGE");
  });
});

describe("年次有給休暇 (6か月時点)", () => {
  it("週5日 → 10日 / 週2日16h → 3日 / 週1日14h → 1日", () => {
    expect(initialPaidLeaveDays(5, 37)).toBe(10);
    expect(initialPaidLeaveDays(2, 16)).toBe(3);
    expect(initialPaidLeaveDays(1, 14)).toBe(1);
  });
});

describe("契約期間", () => {
  it("有期 開始2026-11-01・6か月 → 終了2027-04-30", () => {
    expect(fixedTermEndOn("2026-11-01", 6)).toBe("2027-04-30");
  });
  it("応当日がない月は月末で満了 (1/31 開始・1か月 → 2/28)", () => {
    expect(fixedTermEndOn("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("パート 開始2026-11-01 → 終了2027-04-30、09欄「2027年5月1日から無期契約に切替」", () => {
    const r = computeNotice(partTimeInput(), masters());
    expect(r.view?.contract.endOn).toBe("2027-04-30");
    expect(r.view?.indefiniteConversion).toEqual({ kind: "SWITCH", switchOn: "2027-05-01" });
  });
});

describe("正社員", () => {
  it("09無期転換欄なし、根拠法は労基法15条のみ", () => {
    const r = computeNotice(fullTimeInput(), masters());
    expect(r.errors).toEqual([]);
    expect(r.view?.indefiniteConversion).toBeNull();
    expect(r.view?.legalBasis).toBe("労働基準法第15条");
  });
  it("パート・夜勤専従はパート・有期雇用労働法6条も併記", () => {
    expect(computeNotice(partTimeInput(), masters()).view?.legalBasis).toContain(
      "パートタイム・有期雇用労働法第6条",
    );
  });
  it("資格手当の既定額が未確定の資格 (正看護師) は金額入力がないとエラー", () => {
    const r = computeNotice(
      fullTimeInput({
        wage: {
          kind: "MONTHLY",
          baseYen: 250_000,
          qualification: "NURSE",
          singleParentChildren: 0,
          managerAllowanceYen: 0,
          counselorAllowanceYen: 0,
        },
      }),
      masters(),
    );
    expect(r.errors.map((e) => e.field)).toContain("qualificationAllowanceYen");
  });
});

describe("無期転換 (夜勤専従の更新)", () => {
  it("通算5年以内の更新 → 申込権は発生しない", () => {
    const r = computeNotice(nightOnlyInput({ priorFixedTermMonths: 54 }), masters());
    expect(r.view?.indefiniteConversion).toEqual({
      kind: "RIGHT",
      eligible: false,
      cumulativeMonths: 60,
    });
  });
  it("通算5年超となる更新 → 09欄に申込機会を表示", () => {
    const r = computeNotice(nightOnlyInput({ priorFixedTermMonths: 60 }), masters());
    expect(r.view?.indefiniteConversion).toEqual({
      kind: "RIGHT",
      eligible: true,
      cumulativeMonths: 66,
    });
  });
  it("定年後再雇用で5年超・第二種計画認定なし → 警告", () => {
    const r = computeNotice(
      nightOnlyInput({ priorFixedTermMonths: 60, isPostRetirementRehire: true }),
      masters(),
    );
    expect(r.warnings.map((w) => w.code)).toContain("POST_RETIREMENT_CERTIFICATION");
  });
});

describe("発行前チェック", () => {
  it("必須項目 (勤務先・業務・勤務パターン) の空欄はエラー", () => {
    const r = computeNotice(
      partTimeInput({ officeId: "unknown", jobDescription: " ", patternCodes: [] }),
      masters(),
    );
    expect(r.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["officeId", "jobDescription", "patternCodes"]),
    );
  });
  it("社会保険の手入力が判定と違うと警告", () => {
    const r = computeNotice(
      partTimeInput({
        insuranceOverride: { health: "ENROLLED", pension: "ENROLLED", employment: "NOT_ENROLLED" },
      }),
      masters(),
    );
    expect(r.warnings.map((w) => w.code)).toContain("INSURANCE_MISMATCH");
  });
  it("有期なのに求人票が「期間の定めなし」→ 警告", () => {
    const r = computeNotice(partTimeInput(), masters({ jobPostingIndefiniteTypes: ["PART_TIME"] }));
    expect(r.warnings.map((w) => w.code)).toContain("JOB_POSTING_TERM");
  });
});

describe("通知書番号", () => {
  it("CH-{年}-{連番4桁}、年ごとにリセット", () => {
    expect(formatNoticeNo(2026, 143)).toBe("CH-2026-0143");
    expect(nextNoticeSeq(["CH-2026-0143", "CH-2026-0002", "CH-2025-0999"], 2026)).toBe(144);
    expect(nextNoticeSeq(["CH-2026-0143"], 2027)).toBe(1);
  });
});
