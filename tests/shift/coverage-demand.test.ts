import { describe, expect, it } from "vitest";

import {
  COVERAGE_DEMAND_BOUNDS,
  isOperatingDay,
  validateCoverageDemand,
  type CoverageDemandValues,
} from "@/lib/shift/coverage-demand";

const valid: CoverageDemandValues = {
  amRequired: 7,
  pmRequired: 5,
  counselorAmRequired: 1,
  counselorPmRequired: 1,
  earlyAmRequired: 5,
  nightInRequired: 0,
  nightOutRequired: 0,
};

describe("validateCoverageDemand", () => {
  it("正常値はそのまま返す", () => {
    expect(validateCoverageDemand(valid)).toEqual({ ok: true, values: valid });
  });

  it("オブジェクト以外・欠落・非整数を弾く", () => {
    expect(validateCoverageDemand(null).ok).toBe(false);
    const rest = { ...valid } as Partial<CoverageDemandValues>;
    delete rest.nightOutRequired;
    expect(validateCoverageDemand(rest).ok).toBe(false);
    expect(validateCoverageDemand({ ...valid, amRequired: 7.5 }).ok).toBe(false);
  });

  it("範囲外を弾き、境界値は通す", () => {
    const { max } = COVERAGE_DEMAND_BOUNDS.amRequired;
    expect(validateCoverageDemand({ ...valid, amRequired: max }).ok).toBe(true);
    expect(validateCoverageDemand({ ...valid, amRequired: max + 1 }).ok).toBe(false);
    expect(validateCoverageDemand({ ...valid, amRequired: -1 }).ok).toBe(false);
  });

  it("相談員人数が必要人数を超えると弾く", () => {
    expect(validateCoverageDemand({ ...valid, counselorAmRequired: 8 }).ok).toBe(false);
    expect(validateCoverageDemand({ ...valid, pmRequired: 0, counselorPmRequired: 1 }).ok).toBe(
      false,
    );
  });

  it("送迎人数が午前の必要人数を超えると弾く", () => {
    expect(validateCoverageDemand({ ...valid, amRequired: 7, earlyAmRequired: 8 }).ok).toBe(false);
    expect(validateCoverageDemand({ ...valid, amRequired: 5, earlyAmRequired: 5 }).ok).toBe(true);
  });

  it("夜勤のみ (ショート/ナーシングの夜) も妥当", () => {
    const night = {
      amRequired: 6,
      pmRequired: 6,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    };
    expect(validateCoverageDemand(night).ok).toBe(true);
  });
});

describe("isOperatingDay", () => {
  it("人数の合計>0 は営業日", () => {
    expect(isOperatingDay(valid)).toBe(true);
  });

  it("全0 は休業 (デイの日祝など)", () => {
    expect(
      isOperatingDay({
        amRequired: 0,
        pmRequired: 0,
        counselorAmRequired: 0,
        counselorPmRequired: 0,
        earlyAmRequired: 0,
        nightInRequired: 0,
        nightOutRequired: 0,
      }),
    ).toBe(false);
  });

  it("夜勤だけでも営業日", () => {
    expect(
      isOperatingDay({
        amRequired: 0,
        pmRequired: 0,
        counselorAmRequired: 0,
        counselorPmRequired: 0,
        earlyAmRequired: 0,
        nightInRequired: 1,
        nightOutRequired: 1,
      }),
    ).toBe(true);
  });
});
