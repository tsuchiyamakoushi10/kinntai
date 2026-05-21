import { EmploymentType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { generateMonthlyShifts } from "@/lib/shift/auto-generator";
import type {
  EmployeeForGen,
  GenerateInput,
  PatternForGen,
  QuotaForGen,
} from "@/lib/shift/auto-generator/types";

const OFFICE_ID = "00000000-0000-0000-0000-000000000001";

const baseConstraint = {
  maxMonthlyWorkMinutes: null,
  maxNightShiftsPerMonth: null,
  allowNightShiftOverride: true,
  targetMonthlyWorkDays: null,
  annualIncomeCapYen: null,
  unavailableDaysOfWeek: [] as number[],
};

const DAY_PATTERN: PatternForGen = {
  id: "00000000-0000-0000-0000-000000000010",
  code: "DAY",
  name: "日勤",
  shiftKind: "WORK",
  officeId: null,
  sortOrder: 10,
  workMinutes: 480,
  crossesMidnight: false,
};

const NIGHT_IN_PATTERN: PatternForGen = {
  id: "00000000-0000-0000-0000-000000000020",
  code: "NIGHT_IN",
  name: "夜入",
  shiftKind: "NIGHT_IN",
  officeId: null,
  sortOrder: 30,
  workMinutes: 420,
  crossesMidnight: false,
};

const NIGHT_OUT_PATTERN: PatternForGen = {
  id: "00000000-0000-0000-0000-000000000021",
  code: "NIGHT_OUT",
  name: "夜明",
  shiftKind: "NIGHT_OUT",
  officeId: null,
  sortOrder: 31,
  workMinutes: 480,
  crossesMidnight: false,
};

const OFF_PATTERN: PatternForGen = {
  id: "00000000-0000-0000-0000-000000000050",
  code: "OFF",
  name: "公休",
  shiftKind: "OFF",
  officeId: null,
  sortOrder: 90,
  workMinutes: 0,
  crossesMidnight: false,
};

function mkEmployee(id: string, code: string, ov?: Partial<EmployeeForGen>): EmployeeForGen {
  return {
    id,
    employeeCode: code,
    employmentType: EmploymentType.FULL_TIME,
    joinedOn: "2024-01-01",
    isOnLeave: false,
    weeklyWorkDays: 5,
    hourlyWageYen: null,
    retiredOn: null,
    constraint: { ...baseConstraint },
    ...ov,
  };
}

function dayQuotaAll(n: number): QuotaForGen[] {
  return [
    { shiftPatternId: DAY_PATTERN.id, dayKind: "WEEKDAY", requiredCount: n },
    { shiftPatternId: DAY_PATTERN.id, dayKind: "SATURDAY", requiredCount: n },
    { shiftPatternId: DAY_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: n },
  ];
}

function baseInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    officeId: OFFICE_ID,
    targetMonth: "2026-06",
    seed: 42,
    algorithmVersion: "greedy-v1",
    employees: [mkEmployee("11111111-1111-1111-1111-111111111111", "E0001")],
    shiftPatterns: [DAY_PATTERN, OFF_PATTERN],
    quotas: dayQuotaAll(1),
    preferences: [],
    existingShifts: [],
    prevMonthNightIn: [],
    holidays: [],
    ...overrides,
  };
}

describe("generateMonthlyShifts (warnings 集約)", () => {
  it("QUOTA_UNDERFILLED: 必要人員に対し従業員が足りない", () => {
    const result = generateMonthlyShifts(
      baseInput({
        quotas: dayQuotaAll(3), // 各日 3 人必要だが 1 人しかいない
      }),
    );
    const underfilled = result.warnings.filter((w) => w.code === "QUOTA_UNDERFILLED");
    expect(underfilled.length).toBeGreaterThan(0);
    expect(result.stats.fill.totalSlots).toBe(3 * 30);
    expect(result.stats.fill.filledSlots).toBeLessThan(3 * 30);
    expect(result.stats.fill.rate).toBeLessThan(1);
  });

  it("PREV_MONTH_NIGHT_HANGING: NIGHT_OUT パターンが無いと引き継げず警告", () => {
    const result = generateMonthlyShifts(
      baseInput({
        shiftPatterns: [DAY_PATTERN, OFF_PATTERN], // NIGHT_OUT パターン無し
        prevMonthNightIn: [
          {
            employeeId: "11111111-1111-1111-1111-111111111111",
            workDate: "2026-05-31",
          },
        ],
      }),
    );
    const hanging = result.warnings.filter((w) => w.code === "PREV_MONTH_NIGHT_HANGING");
    expect(hanging).toHaveLength(1);
    expect(hanging[0]).toMatchObject({
      employeeId: "11111111-1111-1111-1111-111111111111",
      date: "2026-06-01",
    });
  });

  it("NIGHT_SHIFT_OVER_LIMIT: override 許可で上限超過すると警告", () => {
    const result = generateMonthlyShifts(
      baseInput({
        shiftPatterns: [NIGHT_IN_PATTERN, NIGHT_OUT_PATTERN, OFF_PATTERN],
        quotas: [
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SATURDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 1 },
        ],
        employees: [
          mkEmployee("11111111-1111-1111-1111-111111111111", "E0001", {
            constraint: {
              ...baseConstraint,
              maxNightShiftsPerMonth: 3,
              allowNightShiftOverride: true, // 上限超え可
            },
          }),
        ],
      }),
    );
    const over = result.warnings.filter((w) => w.code === "NIGHT_SHIFT_OVER_LIMIT");
    expect(over.length).toBe(1);
    expect(over[0]).toMatchObject({
      employeeId: "11111111-1111-1111-1111-111111111111",
      month: "2026-06",
      limit: 3,
    });
  });

  it("TARGET_WORKDAYS_UNREACHED: 目標日数に達しないと警告", () => {
    const result = generateMonthlyShifts(
      baseInput({
        quotas: dayQuotaAll(0), // どの日も配置不要 → 勤務日 0
        employees: [
          mkEmployee("11111111-1111-1111-1111-111111111111", "E0001", {
            constraint: { ...baseConstraint, targetMonthlyWorkDays: 20 },
          }),
        ],
      }),
    );
    const unreached = result.warnings.filter((w) => w.code === "TARGET_WORKDAYS_UNREACHED");
    expect(unreached.length).toBe(1);
    expect(unreached[0]).toMatchObject({
      employeeId: "11111111-1111-1111-1111-111111111111",
      month: "2026-06",
      target: 20,
      assigned: 0,
    });
  });

  it("INCOME_CAP_EXCEEDED: パートが上限超え見込みなら警告", () => {
    // 22 平日 × 480 分 × 時給 5000 円 = 880,000 円。年累積で 1,300,000 超える設定にする
    const result = generateMonthlyShifts(
      baseInput({
        quotas: dayQuotaAll(1),
        employees: [
          mkEmployee("11111111-1111-1111-1111-111111111111", "E0001", {
            employmentType: EmploymentType.PART_TIME,
            hourlyWageYen: 5000,
            constraint: { ...baseConstraint, annualIncomeCapYen: 500_000 },
          }),
        ],
      }),
    );
    const income = result.warnings.filter((w) => w.code === "INCOME_CAP_EXCEEDED");
    expect(income.length).toBe(1);
  });

  it("UNAVAILABLE_DOW_VIOLATED: 既存 shift が不可曜日に乗っていれば警告", () => {
    const result = generateMonthlyShifts(
      baseInput({
        quotas: dayQuotaAll(0),
        existingShifts: [
          {
            employeeId: "11111111-1111-1111-1111-111111111111",
            workDate: "2026-06-06", // 土曜
            shiftPatternId: DAY_PATTERN.id,
          },
        ],
        employees: [
          mkEmployee("11111111-1111-1111-1111-111111111111", "E0001", {
            constraint: { ...baseConstraint, unavailableDaysOfWeek: [6] }, // 土曜不可
          }),
        ],
      }),
    );
    const violated = result.warnings.filter((w) => w.code === "UNAVAILABLE_DOW_VIOLATED");
    expect(violated.length).toBe(1);
    expect(violated[0]).toMatchObject({
      date: "2026-06-06",
      dayOfWeek: 6,
    });
  });

  it("INACTIVE_PATTERN_REFERENCED: quota が無効パターン id を持つと警告", () => {
    const result = generateMonthlyShifts(
      baseInput({
        quotas: [
          {
            shiftPatternId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            dayKind: "WEEKDAY",
            requiredCount: 1,
          },
        ],
      }),
    );
    const inactive = result.warnings.filter((w) => w.code === "INACTIVE_PATTERN_REFERENCED");
    expect(inactive.length).toBe(1);
  });

  it("stats を必ず返す (rate / elapsedMs / seed)", () => {
    // 平日のみに 1 人/日 → 1 名で 22 件埋まる (土日休みで連勤 5 日に収まる)
    const result = generateMonthlyShifts(
      baseInput({
        quotas: [
          { shiftPatternId: DAY_PATTERN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: DAY_PATTERN.id, dayKind: "SATURDAY", requiredCount: 0 },
          { shiftPatternId: DAY_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
        ],
      }),
    );
    expect(result.stats.seed).toBe(42);
    expect(result.stats.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.fill.totalSlots).toBe(22);
    expect(result.stats.fill.filledSlots).toBe(22);
    expect(result.stats.fill.rate).toBe(1);
    expect(result.stats.input.workingDaysInMonth).toBe(30);
  });
});
