import { describe, expect, it } from "vitest";

import { judgeInsurance } from "@/lib/labor-notice/calc";
import { checkSideJobOvertime } from "@/lib/labor-notice/side-job";

describe("本業との合算チェック", () => {
  const fullTimeMainJob = {
    weekdays: [1, 2, 3, 4, 5],
    dailyHours: 8,
    weeklyHours: 40,
    contractedBeforeUs: true,
  };
  // 2026-11-11 は水曜
  const wednesdayNight = {
    workDate: "2026-11-11",
    label: "夜勤",
    workHours: 14,
    nightHours: 7,
    pay: { kind: "DAILY" as const, totalYen: 20_000 },
  };

  it("本業 平日8h×5日、水曜に夜勤 → 同日通算22h・週40h超で警告、短縮夜勤なら時給換算1,290円", () => {
    const [w] = checkSideJobOvertime({
      sideJobs: [fullTimeMainJob],
      weekShifts: [wednesdayNight],
      minWageYen: 1196,
      variableHours: true,
      alternative: { label: "短縮夜勤", workHours: 11, nightHours: 7 },
    });
    expect(w).toBeDefined();
    expect(w?.combinedDailyHours).toBe(22);
    expect(w?.combinedWeeklyHours).toBe(54);
    expect(w?.overtimeHours).toBe(14);
    expect(Math.round(w?.effectiveHourlyYen ?? 0)).toBe(1039);
    expect(w?.belowMinWage).toBe(true);
    expect(Math.round(w?.alternative?.effectiveHourlyYen ?? 0)).toBe(1290);
    expect(w?.alternative?.belowMinWage).toBe(false);
  });

  it("本業の契約が後なら結いの心は割増を払わない → 警告なし", () => {
    const r = checkSideJobOvertime({
      sideJobs: [{ ...fullTimeMainJob, contractedBeforeUs: false }],
      weekShifts: [wednesdayNight],
      minWageYen: 1196,
      variableHours: true,
    });
    expect(r).toEqual([]);
  });

  it("変形制なし (パート時給) で本業4h の日に日勤8h → 4h が時間外", () => {
    const [w] = checkSideJobOvertime({
      sideJobs: [{ weekdays: [3], dailyHours: 4, weeklyHours: 4, contractedBeforeUs: true }],
      weekShifts: [
        {
          workDate: "2026-11-11",
          label: "日勤",
          workHours: 8,
          nightHours: 0,
          pay: { kind: "HOURLY", hourlyYen: 1200 },
        },
      ],
      minWageYen: 1196,
      variableHours: false,
    });
    expect(w?.overtimeHours).toBe(4);
    expect(w?.overtimePremiumYen).toBe(1200);
  });

  it("本業が週20h・土日に夜勤1回 → 通算で超えないので警告なし", () => {
    const r = checkSideJobOvertime({
      sideJobs: [{ weekdays: [1, 3], dailyHours: 4, weeklyHours: 20, contractedBeforeUs: true }],
      weekShifts: [{ ...wednesdayNight, workDate: "2026-11-14" }],
      minWageYen: 1196,
      variableHours: true,
    });
    expect(r).toEqual([]);
  });
});

describe("社会保険・雇用保険の判定", () => {
  const base = {
    onDate: "2026-11-01",
    isFullTime: false,
    isStudent: false,
    expectedOver31Days: true,
    fulltimeWeeklyHours: 37,
    fulltimeMonthlyDays: 21,
    employeeCount: 45,
  };
  it("週2日16h → 社保対象外・雇保対象外", () => {
    expect(
      judgeInsurance({ ...base, hoursPerWeek: 16, daysPerWeek: 2, monthlyWageYen: 83_000 }),
    ).toEqual({
      health: "NOT_ENROLLED",
      pension: "NOT_ENROLLED",
      employment: "NOT_ENROLLED",
    });
  });
  it("週4日30h → 4分の3基準で社保加入", () => {
    const r = judgeInsurance({
      ...base,
      hoursPerWeek: 30,
      daysPerWeek: 4,
      monthlyWageYen: 150_000,
    });
    expect(r.health).toBe("ENROLLED");
    expect(r.employment).toBe("ENROLLED");
  });
  it("45人の会社・週20h・月9万円: 2027-09 は対象外、2027-10 から加入 (36人基準)", () => {
    const args = { ...base, hoursPerWeek: 22, daysPerWeek: 3, monthlyWageYen: 95_000 };
    expect(judgeInsurance({ ...args, onDate: "2027-09-30" }).health).toBe("NOT_ENROLLED");
    expect(judgeInsurance({ ...args, onDate: "2027-10-01" }).health).toBe("ENROLLED");
  });
  it("雇用保険は2028-10から週10時間以上", () => {
    const args = { ...base, hoursPerWeek: 14, daysPerWeek: 1, monthlyWageYen: 80_000 };
    expect(judgeInsurance({ ...args, onDate: "2028-09-30" }).employment).toBe("NOT_ENROLLED");
    expect(judgeInsurance({ ...args, onDate: "2028-10-01" }).employment).toBe("ENROLLED");
  });
});
