import { describe, expect, it } from "vitest";

import {
  OFFICE_SHIFT_SETTING_BOUNDS,
  OFFICE_SHIFT_SETTING_DEFAULTS,
  validateOfficeShiftSetting,
} from "@/lib/shift/office-setting";

const valid = {
  maxConsecutiveWorkDays: 6,
  defaultMaxNightShiftsPerMonth: 5,
  defaultAnnualIncomeCapYen: 1_300_000,
};

describe("validateOfficeShiftSetting", () => {
  it("正常値はそのまま正規化して返す", () => {
    const r = validateOfficeShiftSetting(valid);
    expect(r).toEqual({ ok: true, values: valid });
  });

  it("既定値 (DEFAULT) は検証を通る", () => {
    const r = validateOfficeShiftSetting(OFFICE_SHIFT_SETTING_DEFAULTS);
    expect(r.ok).toBe(true);
  });

  it("オブジェクト以外は弾く", () => {
    for (const bad of [null, undefined, 1, "x", []]) {
      expect(validateOfficeShiftSetting(bad).ok).toBe(false);
    }
  });

  it("項目が欠落していたら弾く", () => {
    const { defaultAnnualIncomeCapYen: _omit, ...rest } = valid;
    expect(validateOfficeShiftSetting(rest).ok).toBe(false);
  });

  it("非整数 (小数・NaN・文字列) は弾く", () => {
    expect(validateOfficeShiftSetting({ ...valid, maxConsecutiveWorkDays: 6.5 }).ok).toBe(false);
    expect(validateOfficeShiftSetting({ ...valid, maxConsecutiveWorkDays: NaN }).ok).toBe(false);
    expect(validateOfficeShiftSetting({ ...valid, defaultMaxNightShiftsPerMonth: "5" }).ok).toBe(
      false,
    );
  });

  it("各項目の境界値 (min/max) は通り、範囲外は弾く", () => {
    const keys = [
      "maxConsecutiveWorkDays",
      "defaultMaxNightShiftsPerMonth",
      "defaultAnnualIncomeCapYen",
    ] as const;
    for (const key of keys) {
      const { min, max } = OFFICE_SHIFT_SETTING_BOUNDS[key];
      expect(validateOfficeShiftSetting({ ...valid, [key]: min }).ok).toBe(true);
      expect(validateOfficeShiftSetting({ ...valid, [key]: max }).ok).toBe(true);
      expect(validateOfficeShiftSetting({ ...valid, [key]: min - 1 }).ok).toBe(false);
      expect(validateOfficeShiftSetting({ ...valid, [key]: max + 1 }).ok).toBe(false);
    }
  });

  it("夜勤上限 0 (夜勤なし拠点) を許容する", () => {
    expect(validateOfficeShiftSetting({ ...valid, defaultMaxNightShiftsPerMonth: 0 }).ok).toBe(
      true,
    );
  });
});
