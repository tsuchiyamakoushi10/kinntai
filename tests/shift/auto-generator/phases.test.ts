/**
 * フェーズ式 自動生成 (v2) の挙動テスト。
 *
 * docs/auto-shift-design-v2.md §7 のテスト方針:
 *   - Phase 2: 夜勤希望が残る人が優先される / 夜勤希望未充足の警告
 *   - 拠点設定 (連勤上限) を変えると結果が変わる
 *   - Phase 4: パートは年収上限を超えない範囲を優先
 */
import { EmploymentType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { generateMonthlyShifts } from "@/lib/shift/auto-generator";
import { placeShifts } from "@/lib/shift/auto-generator/placement";
import type {
  EmployeeForGen,
  GenerateInput,
  PatternForGen,
  ShiftGenSetting,
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

const DAY: PatternForGen = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "DAY",
  name: "日勤",
  shiftKind: "WORK",
  officeId: null,
  sortOrder: 10,
  workMinutes: 480,
  crossesMidnight: false,
};
const NIGHT_IN: PatternForGen = {
  id: "10000000-0000-0000-0000-000000000002",
  code: "NIGHT_IN",
  name: "夜入",
  shiftKind: "NIGHT_IN",
  officeId: null,
  sortOrder: 30,
  workMinutes: 420,
  crossesMidnight: false,
};
const NIGHT_OUT: PatternForGen = {
  id: "10000000-0000-0000-0000-000000000003",
  code: "NIGHT_OUT",
  name: "夜明",
  shiftKind: "NIGHT_OUT",
  officeId: null,
  sortOrder: 31,
  workMinutes: 480,
  crossesMidnight: false,
};
const OFF: PatternForGen = {
  id: "10000000-0000-0000-0000-000000000004",
  code: "OFF",
  name: "公休",
  shiftKind: "OFF",
  officeId: null,
  sortOrder: 90,
  workMinutes: 0,
  crossesMidnight: false,
};

const A = "20000000-0000-0000-0000-00000000000a";
const B = "20000000-0000-0000-0000-00000000000b";

function mkEmp(id: string, code: string, ov?: Partial<EmployeeForGen>): EmployeeForGen {
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

function input(ov: Partial<GenerateInput> = {}): GenerateInput {
  return {
    officeId: OFFICE_ID,
    targetMonth: "2026-06", // 06-01 は月曜。土 = 6,13,20,27
    seed: 123,
    algorithmVersion: "phase-v2",
    employees: [mkEmp(A, "E0001"), mkEmp(B, "E0002")],
    shiftPatterns: [DAY, NIGHT_IN, NIGHT_OUT, OFF],
    quotas: [],
    preferences: [],
    existingShifts: [],
    prevMonthNightIn: [],
    holidays: [],
    ...ov,
  };
}

describe("Phase 2: 夜勤希望の優先 (案A)", () => {
  // 土曜のみ夜勤 1 枠 (土→日に夜明けが乗るので互いに干渉しない 4 件)。
  const satNightQuota = [
    { shiftPatternId: NIGHT_IN.id, dayKind: "WEEKDAY" as const, requiredCount: 0 },
    { shiftPatternId: NIGHT_IN.id, dayKind: "SATURDAY" as const, requiredCount: 1 },
    { shiftPatternId: NIGHT_IN.id, dayKind: "SUNDAY_HOLIDAY" as const, requiredCount: 0 },
  ];

  it("夜勤希望が残る人が先に夜勤に入る", () => {
    const result = placeShifts(
      input({
        quotas: satNightQuota,
        employees: [
          mkEmp(A, "E0001", { desiredNightShiftsPerMonth: 2, constraint: { ...baseConstraint } }),
          mkEmp(B, "E0002", { desiredNightShiftsPerMonth: 0, constraint: { ...baseConstraint } }),
        ],
      }),
    );
    const ni = (date: string) =>
      result.proposedShifts.find((p) => p.workDate === date && p.shiftPatternId === NIGHT_IN.id)
        ?.employeeId;
    // A は希望 2 回 → 最初の 2 土曜が A、残りは B。
    expect(ni("2026-06-06")).toBe(A);
    expect(ni("2026-06-13")).toBe(A);
    expect(ni("2026-06-20")).toBe(B);
    expect(ni("2026-06-27")).toBe(B);
  });

  it("夜勤希望回数に届かないと NIGHT_PREF_UNMET 警告が出る", () => {
    const result = generateMonthlyShifts(
      input({
        quotas: satNightQuota,
        employees: [mkEmp(A, "E0001", { desiredNightShiftsPerMonth: 5 })], // 土は 4 回しかない
      }),
    );
    const w = result.warnings.find((x) => x.code === "NIGHT_PREF_UNMET");
    expect(w).toBeDefined();
    expect(w).toMatchObject({ employeeId: A, desired: 5, assigned: 4 });
  });
});

describe("拠点設定: 連勤上限を変えると結果が変わる", () => {
  const everyDayQuota = [
    { shiftPatternId: DAY.id, dayKind: "WEEKDAY" as const, requiredCount: 1 },
    { shiftPatternId: DAY.id, dayKind: "SATURDAY" as const, requiredCount: 1 },
    { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY" as const, requiredCount: 1 },
  ];

  function maxWorkRun(
    proposed: ReadonlyArray<{ workDate: string; shiftPatternId: string }>,
  ): number {
    const workDates = new Set(
      proposed.filter((p) => p.shiftPatternId === DAY.id).map((p) => p.workDate),
    );
    const sorted = [...workDates].sort();
    let max = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
      const prevDay = prev ? new Date(`${prev}T00:00:00Z`) : null;
      const cur = new Date(`${d}T00:00:00Z`);
      const consecutive = prevDay != null && cur.getTime() - prevDay.getTime() === 86_400_000;
      run = consecutive ? run + 1 : 1;
      if (run > max) max = run;
      prev = d;
    }
    return max;
  }

  const setting = (maxConsecutiveWorkDays: number): ShiftGenSetting => ({
    maxConsecutiveWorkDays,
    defaultMaxNightShiftsPerMonth: 5,
    defaultAnnualIncomeCapYen: 1_300_000,
  });

  it("連勤上限 3 なら 1 人の勤務が 3 連勤を超えない", () => {
    const result = placeShifts(
      input({ employees: [mkEmp(A, "E0001")], quotas: everyDayQuota, setting: setting(3) }),
    );
    expect(maxWorkRun(result.proposedShifts)).toBeLessThanOrEqual(3);
    // 単独では埋めきれず不足が出る
    expect(result.fill.underfilled.length).toBeGreaterThan(0);
  });

  it("既定 (連勤上限 6) なら 3 連勤を超える日が出る", () => {
    const result = placeShifts(input({ employees: [mkEmp(A, "E0001")], quotas: everyDayQuota }));
    expect(maxWorkRun(result.proposedShifts)).toBeGreaterThan(3);
  });
});

describe("Phase 4: パートは年収上限を超えない範囲を優先", () => {
  const weekdayDayQuota = [
    { shiftPatternId: DAY.id, dayKind: "WEEKDAY" as const, requiredCount: 1 },
    { shiftPatternId: DAY.id, dayKind: "SATURDAY" as const, requiredCount: 0 },
    { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY" as const, requiredCount: 0 },
  ];

  it("上限の近いパートは超えず、余裕のあるパートが残りを埋める", () => {
    // P1: 時給3000 × 8h = 24,000/日, 上限 300,000 → 12 日まで。P2: 上限なし相当。
    const P1 = "30000000-0000-0000-0000-000000000001";
    const P2 = "30000000-0000-0000-0000-000000000002";
    const result = generateMonthlyShifts(
      input({
        employees: [
          mkEmp(P1, "P0001", {
            employmentType: EmploymentType.PART_TIME,
            hourlyWageYen: 3000,
            constraint: { ...baseConstraint, annualIncomeCapYen: 300_000 },
          }),
          mkEmp(P2, "P0002", {
            employmentType: EmploymentType.PART_TIME,
            hourlyWageYen: 1000,
          }),
        ],
        quotas: weekdayDayQuota,
      }),
    );
    // 22 平日すべて埋まる (P2 が吸収)
    expect(result.stats.fill.filledSlots).toBe(22);
    // P1 は上限内 (12 日 = 288,000 円 以下) に収まり、年収超過警告は出ない
    const p1Days = result.proposedShifts.filter(
      (p) => p.employeeId === P1 && p.shiftPatternId === DAY.id,
    ).length;
    expect(p1Days).toBeLessThanOrEqual(12);
    expect(
      result.warnings.find((w) => w.code === "INCOME_CAP_EXCEEDED" && w.employeeId === P1),
    ).toBeUndefined();
  });
});
