import { describe, expect, it } from "vitest";

import {
  REQUESTED_OFF_LIMIT_FULL_TIME,
  REQUESTED_OFF_LIMIT_PART_TIME,
  isWithinRequestedOffLimit,
  maxRequestedOffPerMonth,
} from "@/lib/shift-preference-limit";

describe("maxRequestedOffPerMonth", () => {
  it("正社員は月3日", () => {
    expect(maxRequestedOffPerMonth("FULL_TIME")).toBe(REQUESTED_OFF_LIMIT_FULL_TIME);
    expect(maxRequestedOffPerMonth("FULL_TIME")).toBe(3);
  });

  it("パート (社保あり/なし) は月5日", () => {
    expect(maxRequestedOffPerMonth("PART_TIME_INSURED")).toBe(REQUESTED_OFF_LIMIT_PART_TIME);
    expect(maxRequestedOffPerMonth("PART_TIME_UNINSURED")).toBe(5);
  });

  it("雇用形態未設定はゆるい側 (パート5日) を既定とする", () => {
    expect(maxRequestedOffPerMonth(null)).toBe(REQUESTED_OFF_LIMIT_PART_TIME);
  });
});

describe("isWithinRequestedOffLimit", () => {
  it("上限ちょうどは許可する", () => {
    expect(isWithinRequestedOffLimit(3, "FULL_TIME")).toBe(true);
    expect(isWithinRequestedOffLimit(5, "PART_TIME_INSURED")).toBe(true);
  });

  it("上限超過のときだけ false", () => {
    expect(isWithinRequestedOffLimit(4, "FULL_TIME")).toBe(false);
    expect(isWithinRequestedOffLimit(6, "PART_TIME_UNINSURED")).toBe(false);
  });

  it("0日は常に許可", () => {
    expect(isWithinRequestedOffLimit(0, "FULL_TIME")).toBe(true);
    expect(isWithinRequestedOffLimit(0, null)).toBe(true);
  });

  it("雇用形態未設定はパート上限 (5日) で判定", () => {
    expect(isWithinRequestedOffLimit(5, null)).toBe(true);
    expect(isWithinRequestedOffLimit(6, null)).toBe(false);
  });
});
