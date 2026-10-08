import { describe, expect, it } from "vitest";

import { computeNotice } from "@/lib/labor-notice/compute";
import { toContractData, toEmployeeSnapshot } from "@/lib/labor-notice/contract-mapping";
import { applyPreset, nextContractInput, todayJst } from "@/lib/labor-notice/defaults";
import { parseAcknowledgements, parseNoticeInput } from "@/lib/labor-notice/parse";

import { masters, nightOnlyInput, partTimeInput } from "./fixtures";

describe("parseNoticeInput", () => {
  it("正しい入力は JSON 往復でそのまま通る", () => {
    const input = partTimeInput();
    expect(parseNoticeInput(JSON.parse(JSON.stringify(input)))).toEqual({
      ...input,
      wage: { ...input.wage, qualificationAllowanceYen: null },
    });
  });
  it("知らない区分・負の金額・未知の上書き項目は弾く", () => {
    expect(parseNoticeInput({ ...partTimeInput(), employmentType: "CEO" })).toBeNull();
    expect(
      parseNoticeInput({
        ...partTimeInput(),
        wage: { kind: "HOURLY", hourlyYen: -1, qualification: "NONE", worksNight: false },
      }),
    ).toBeNull();
    expect(parseNoticeInput({ ...partTimeInput(), overrides: { evil: "x" } })).toBeNull();
  });
  it("確認記録は既知の警告コードだけ受け付ける", () => {
    expect(parseAcknowledgements([{ code: "MIN_WAGE", reason: " 来月改定 " }])).toEqual([
      { code: "MIN_WAGE", reason: "来月改定" },
    ]);
    expect(parseAcknowledgements([{ code: "DROP_TABLE", reason: "" }])).toBeNull();
  });
});

describe("プリセットと次の契約", () => {
  it("区分を選ぶと既定の契約期間・勤務パターンが入り、従業員や日付は引き継ぐ", () => {
    const next = applyPreset("NIGHT_ONLY", partTimeInput({ overrides: { holidays: "x" } }));
    expect(next.fixedTermMonths).toBe(6);
    expect(next.convertsToIndefinite).toBe(false);
    expect(next.patternCodes).toEqual(["NIGHT", "SHORT_NIGHT"]);
    expect(next.wage).toEqual({ kind: "NIGHT_DAILY", totalYen: 20_000, nightHours: 7 });
    expect(next.overrides).toEqual({});
    expect(next.contractStartOn).toBe("2026-11-01");
  });
  it("パートの無期切替: 前回終了日の翌日から期間の定めなし", () => {
    const next = nextContractInput(partTimeInput(), "2027-04-30", "TO_INDEFINITE", "2027-04-01");
    expect(next.contractStartOn).toBe("2027-05-01");
    expect(next.fixedTermMonths).toBeNull();
    expect(computeNotice(next, masters()).view?.indefiniteConversion).toBeNull();
  });
  it("夜勤専従の更新: 通算月数を積む", () => {
    const next = nextContractInput(
      nightOnlyInput({ priorFixedTermMonths: 54 }),
      "2027-04-30",
      "RENEW",
      "2027-04-01",
    );
    expect(next.priorFixedTermMonths).toBe(60);
    expect(next.contractStartOn).toBe("2027-05-01");
  });
  it("todayJst は JST の暦日 (UTC 15:30 は翌日)", () => {
    expect(todayJst(new Date("2026-10-08T15:30:00Z"))).toBe("2026-10-09");
  });
});

describe("発行時に契約データへ写す値", () => {
  it("パート 週2日16h: 社保なしパート・時給・更新なし (無期切替)", () => {
    const input = partTimeInput();
    const { view } = computeNotice(input, masters());
    const c = toContractData(input, view!);
    expect(c).toMatchObject({
      contractStartOn: "2026-11-01",
      contractEndOn: "2027-04-30",
      employmentType: "PART_TIME_UNINSURED",
      workingDaysPerWeek: 2,
      workingHoursPerDay: 8,
      wageType: "HOURLY",
      wageAmount: 1200,
      isRenewable: false,
      weeklyHoursCategory: "UNDER_20",
      hasBonus: true,
    });
    expect(toEmployeeSnapshot(input, c)).not.toHaveProperty("nightShiftOnly");
  });
  it("夜勤専従: 日給・更新あり・従業員に夜勤専従フラグ", () => {
    const input = nightOnlyInput();
    const { view } = computeNotice(input, masters());
    const c = toContractData(input, view!);
    expect(c).toMatchObject({
      wageType: "DAILY",
      wageAmount: 20_000,
      isRenewable: true,
      hasBonus: false,
    });
    expect(toEmployeeSnapshot(input, c).nightShiftOnly).toBe(true);
  });
});
