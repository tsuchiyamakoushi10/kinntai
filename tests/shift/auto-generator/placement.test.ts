/**
 * 配置本体 (placement.ts) のスモークテスト。
 *
 * 設計書 §8 の網羅シナリオは 1-H-3e で書き、本ファイルでは挙動の
 * 中核 (基本配置 / 不可日除外 / 夜勤上限 / 決定論) だけを担保する。
 */
import { EmploymentType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { placeShifts } from "@/lib/shift/auto-generator/placement";
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

function dayQuota(reqWeekday: number): QuotaForGen[] {
  return [
    { shiftPatternId: DAY_PATTERN.id, dayKind: "WEEKDAY", requiredCount: reqWeekday },
    { shiftPatternId: DAY_PATTERN.id, dayKind: "SATURDAY", requiredCount: 0 },
    { shiftPatternId: DAY_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
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
    quotas: dayQuota(1),
    preferences: [],
    existingShifts: [],
    prevMonthNightIn: [],
    holidays: [],
    ...overrides,
  };
}

describe("placeShifts", () => {
  it("単純: 1 名 × 日勤 1 枠/平日 → 平日全部に日勤、土日祝に公休が入る", () => {
    const result = placeShifts(baseInput());
    // 2026-06 は 平日 22 + 土 4 + 日祝 4 = 30 日
    const day = result.proposedShifts.filter((p) => p.shiftPatternId === DAY_PATTERN.id);
    const off = result.proposedShifts.filter((p) => p.shiftPatternId === OFF_PATTERN.id);
    expect(day).toHaveLength(22); // 平日 22 日
    expect(off).toHaveLength(8); // 土 + 日祝 = 8 日
    expect(result.fill.totalSlots).toBe(22);
    expect(result.fill.filledSlots).toBe(22);
  });

  it("REQUESTED_OFF は配置から除外され、QUOTA_UNDERFILLED が出る", () => {
    const result = placeShifts(
      baseInput({
        preferences: [
          {
            employeeId: "11111111-1111-1111-1111-111111111111",
            targetDate: "2026-06-01", // 月曜
            preferenceType: "REQUESTED_OFF",
          },
        ],
      }),
    );
    // 2026-06-01 (月) は日勤が埋まらない
    const day0601 = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-01" && p.shiftPatternId === DAY_PATTERN.id,
    );
    expect(day0601).toBeUndefined();
    // 不足が underfilled に出る
    expect(result.fill.underfilled).toContainEqual({
      date: "2026-06-01",
      shiftPatternId: DAY_PATTERN.id,
      shiftPatternCode: "DAY",
      required: 1,
      filled: 0,
    });
    // unavailable な日には OFF も入れない (雇用期間外と区別できないため)
    const off0601 = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-01" && p.shiftPatternId === OFF_PATTERN.id,
    );
    expect(off0601).toBeUndefined();
  });

  it("NIGHT_IN を配置すると翌日に同 employee の NIGHT_OUT が入る", () => {
    const result = placeShifts(
      baseInput({
        shiftPatterns: [NIGHT_IN_PATTERN, NIGHT_OUT_PATTERN, OFF_PATTERN],
        quotas: [
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SATURDAY", requiredCount: 0 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
        ],
      }),
    );
    // 月曜 2026-06-01 に NIGHT_IN が入り、火曜 2026-06-02 に NIGHT_OUT が入る
    const ni = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-01" && p.shiftPatternId === NIGHT_IN_PATTERN.id,
    );
    const no = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-02" && p.shiftPatternId === NIGHT_OUT_PATTERN.id,
    );
    expect(ni?.employeeId).toBe("11111111-1111-1111-1111-111111111111");
    expect(no?.employeeId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("夜勤上限 (既定 5) を尊重し、上限内では超えない", () => {
    const result = placeShifts(
      baseInput({
        shiftPatterns: [NIGHT_IN_PATTERN, NIGHT_OUT_PATTERN, OFF_PATTERN],
        // 22 平日それぞれに夜勤 1 枠
        quotas: [
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SATURDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN_PATTERN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 1 },
        ],
        employees: [
          mkEmployee("11111111-1111-1111-1111-111111111111", "E0001", {
            constraint: {
              ...baseConstraint,
              maxNightShiftsPerMonth: 5,
              allowNightShiftOverride: false, // override 不可で確実に 5 件で止める
            },
          }),
        ],
      }),
    );
    const niCount = result.proposedShifts.filter(
      (p) => p.shiftPatternId === NIGHT_IN_PATTERN.id,
    ).length;
    // 30 件すべてを 1 人で埋めるのは不可。5 件で停止する。
    expect(niCount).toBeLessThanOrEqual(5);
    // 残りは underfilled に出る (30 - 5 = 25 件以上)
    expect(result.fill.underfilled.length).toBeGreaterThan(0);
  });

  it("同じ seed で実行すると同じ結果になる (決定論性)", () => {
    const r1 = placeShifts(
      baseInput({
        employees: [
          mkEmployee("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "E0001"),
          mkEmployee("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "E0002"),
        ],
      }),
    );
    const r2 = placeShifts(
      baseInput({
        employees: [
          mkEmployee("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "E0001"),
          mkEmployee("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "E0002"),
        ],
      }),
    );
    expect(r1.proposedShifts).toEqual(r2.proposedShifts);
  });

  it("既存 shifts は配置で上書きされず、占有日にはそのまま残る", () => {
    const existing = {
      employeeId: "11111111-1111-1111-1111-111111111111",
      workDate: "2026-06-01",
      shiftPatternId: DAY_PATTERN.id,
    };
    const result = placeShifts(
      baseInput({
        existingShifts: [existing],
        quotas: dayQuota(1),
      }),
    );
    // 2026-06-01 の日勤 quota は既存配置で埋まる (unavailable で除外されるが既に占有済)
    // 既存 shift 自身は proposedShifts には含まれない (差分の責務は呼び出し側)
    const onJune1 = result.proposedShifts.filter((p) => p.workDate === "2026-06-01");
    expect(onJune1).toEqual([]);
  });

  it("前月末 NIGHT_IN を引き継ぐと当月 1 日に NIGHT_OUT が入る", () => {
    const result = placeShifts(
      baseInput({
        shiftPatterns: [DAY_PATTERN, NIGHT_IN_PATTERN, NIGHT_OUT_PATTERN, OFF_PATTERN],
        prevMonthNightIn: [
          {
            employeeId: "11111111-1111-1111-1111-111111111111",
            workDate: "2026-05-31",
          },
        ],
      }),
    );
    const no = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-01" && p.shiftPatternId === NIGHT_OUT_PATTERN.id,
    );
    expect(no?.employeeId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.hangingNightOut).toHaveLength(0);
  });
});
