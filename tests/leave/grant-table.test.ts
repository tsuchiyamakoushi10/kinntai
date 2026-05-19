import { describe, expect, it } from "vitest";

import {
  FULL_TIME_GRANT_DAYS,
  PROPORTIONAL_GRANT_DAYS,
  computeGrantDays,
  isProportional,
  tenureBucket,
} from "@/lib/leave/grant-table";

describe("isProportional", () => {
  it("週 5 日勤務はフルタイム扱い", () => {
    expect(isProportional(5, 40)).toBe(false);
  });
  it("週 4 日かつ 30h 未満は比例付与", () => {
    expect(isProportional(4, 28)).toBe(true);
  });
  it("週 4 日でも 30h 以上はフルタイム", () => {
    expect(isProportional(4, 30)).toBe(false);
  });
  it("週 1 日は比例付与", () => {
    expect(isProportional(1, 8)).toBe(true);
  });
});

describe("tenureBucket", () => {
  it("6 か月未満は付与対象外", () => {
    expect(tenureBucket(0)).toBeNull();
    expect(tenureBucket(5)).toBeNull();
  });
  it("6 か月でバケット 0", () => {
    expect(tenureBucket(6)).toBe(0);
  });
  it("17 か月までバケット 0、18 か月でバケット 1", () => {
    expect(tenureBucket(17)).toBe(0);
    expect(tenureBucket(18)).toBe(1);
  });
  it("6.5 年 (78 か月) でバケット 6", () => {
    expect(tenureBucket(78)).toBe(6);
  });
  it("バケット 6 で頭打ち", () => {
    expect(tenureBucket(200)).toBe(6);
  });
});

describe("computeGrantDays フルタイム", () => {
  const ft = (months: number) =>
    computeGrantDays({ monthsSinceHired: months, weeklyWorkDays: 5, weeklyWorkHours: 40 });

  it("半年で 10 日", () => {
    expect(ft(6)).toBe(10);
  });
  it("1 年半で 11 日", () => {
    expect(ft(18)).toBe(11);
  });
  it("6.5 年以上で 20 日", () => {
    expect(ft(78)).toBe(20);
    expect(ft(120)).toBe(20);
  });
  it("半年未満は 0", () => {
    expect(ft(0)).toBe(0);
    expect(ft(5)).toBe(0);
  });
  it("FULL_TIME 表の長さは 7", () => {
    expect(FULL_TIME_GRANT_DAYS).toHaveLength(7);
  });
});

describe("computeGrantDays 比例付与", () => {
  it("週 4 日・28h・半年で 7 日", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 4, weeklyWorkHours: 28 })).toBe(
      7,
    );
  });
  it("週 4 日・28h・6.5 年で 15 日", () => {
    expect(computeGrantDays({ monthsSinceHired: 78, weeklyWorkDays: 4, weeklyWorkHours: 28 })).toBe(
      15,
    );
  });
  it("週 3 日・半年で 5 日", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 3, weeklyWorkHours: 24 })).toBe(
      5,
    );
  });
  it("週 2 日・半年で 3 日", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 2, weeklyWorkHours: 16 })).toBe(
      3,
    );
  });
  it("週 1 日・半年で 1 日", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 1, weeklyWorkHours: 8 })).toBe(
      1,
    );
  });
  it("週 0 日は付与なし", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 0, weeklyWorkHours: 0 })).toBe(
      0,
    );
  });
  it("PROPORTIONAL 表は各行 7 要素", () => {
    for (const row of Object.values(PROPORTIONAL_GRANT_DAYS)) {
      expect(row).toHaveLength(7);
    }
  });
});

describe("computeGrantDays 境界", () => {
  it("週 4.5 日は 4 日以下ではないのでフルタイム表が適用される", () => {
    expect(
      computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 4.5, weeklyWorkHours: 28 }),
    ).toBe(10);
  });
  it("週 0.5 日でも 1 日扱いで 1 日付与", () => {
    expect(computeGrantDays({ monthsSinceHired: 6, weeklyWorkDays: 0.5, weeklyWorkHours: 4 })).toBe(
      1,
    );
  });
});
