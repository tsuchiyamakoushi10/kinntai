/**
 * 設計書 §8 の網羅シナリオの統合テスト。
 *
 * 単一モジュールではなく `generateMonthlyShifts` 全体に対する動作確認。
 * 各シナリオは「与えた入力に対する出力 (proposedShifts / warnings / stats) が
 * 期待通りか」を検証する。
 */
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

const EMP1 = "20000000-0000-0000-0000-000000000001";
const EMP2 = "20000000-0000-0000-0000-000000000002";
const EMP3 = "20000000-0000-0000-0000-000000000003";

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
    targetMonth: "2026-06",
    seed: 123,
    algorithmVersion: "greedy-v1",
    employees: [mkEmp(EMP1, "E0001"), mkEmp(EMP2, "E0002"), mkEmp(EMP3, "E0003")],
    shiftPatterns: [DAY, NIGHT_IN, NIGHT_OUT, OFF],
    quotas: [
      { shiftPatternId: DAY.id, dayKind: "WEEKDAY", requiredCount: 1 },
      { shiftPatternId: DAY.id, dayKind: "SATURDAY", requiredCount: 1 },
      { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 1 },
    ] as QuotaForGen[],
    preferences: [],
    existingShifts: [],
    prevMonthNightIn: [],
    holidays: [],
    ...ov,
  };
}

describe("シナリオ §8.1 全パターン埋まる単純系", () => {
  it("3 名 / 各日 1 枠 → 30 枠すべて埋まる", () => {
    const result = generateMonthlyShifts(input());
    expect(result.stats.fill.totalSlots).toBe(30);
    expect(result.stats.fill.filledSlots).toBe(30);
    expect(result.stats.fill.rate).toBe(1);
    // QUOTA_UNDERFILLED は出ない
    expect(result.warnings.filter((w) => w.code === "QUOTA_UNDERFILLED")).toHaveLength(0);
  });
});

describe("シナリオ §8.2 希望休 / 不可曜日の除外", () => {
  it("不可曜日に該当する日は配置されない (他の従業員でカバー)", () => {
    const result = generateMonthlyShifts(
      input({
        employees: [
          mkEmp(EMP1, "E0001", {
            constraint: { ...baseConstraint, unavailableDaysOfWeek: [0, 6] }, // 土日不可
          }),
          mkEmp(EMP2, "E0002"),
          mkEmp(EMP3, "E0003"),
        ],
      }),
    );
    // EMP1 は土日に勤務系で配置されない
    const sat = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-06" && p.shiftPatternId === DAY.id,
    );
    expect(sat?.employeeId).not.toBe(EMP1);
  });

  it("REQUESTED_OFF の日は配置されない", () => {
    const result = generateMonthlyShifts(
      input({
        employees: [mkEmp(EMP1, "E0001")],
        preferences: [
          { employeeId: EMP1, targetDate: "2026-06-08", preferenceType: "REQUESTED_OFF" },
        ],
        quotas: [
          { shiftPatternId: DAY.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: DAY.id, dayKind: "SATURDAY", requiredCount: 0 },
          { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
        ],
      }),
    );
    const day8 = result.proposedShifts.find(
      (p) => p.workDate === "2026-06-08" && p.shiftPatternId === DAY.id,
    );
    expect(day8).toBeUndefined();
  });
});

describe("シナリオ §8.3 夜勤上限と override", () => {
  it("override 不可なら上限 5 件で停止し UNDERFILLED が出る", () => {
    const result = generateMonthlyShifts(
      input({
        employees: [
          mkEmp(EMP1, "E0001", {
            constraint: {
              ...baseConstraint,
              maxNightShiftsPerMonth: 5,
              allowNightShiftOverride: false,
            },
          }),
        ],
        quotas: [
          { shiftPatternId: NIGHT_IN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN.id, dayKind: "SATURDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 1 },
        ],
      }),
    );
    const niCount = result.proposedShifts.filter((p) => p.shiftPatternId === NIGHT_IN.id).length;
    expect(niCount).toBeLessThanOrEqual(5);
    expect(result.warnings.filter((w) => w.code === "QUOTA_UNDERFILLED").length).toBeGreaterThan(0);
  });

  it("override 許可なら上限超え + NIGHT_SHIFT_OVER_LIMIT 警告で配置を続ける", () => {
    const result = generateMonthlyShifts(
      input({
        employees: [
          mkEmp(EMP1, "E0001", {
            constraint: {
              ...baseConstraint,
              maxNightShiftsPerMonth: 3,
              allowNightShiftOverride: true,
            },
          }),
        ],
        quotas: [
          { shiftPatternId: NIGHT_IN.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: NIGHT_IN.id, dayKind: "SATURDAY", requiredCount: 0 },
          { shiftPatternId: NIGHT_IN.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
        ],
      }),
    );
    const niCount = result.proposedShifts.filter((p) => p.shiftPatternId === NIGHT_IN.id).length;
    expect(niCount).toBeGreaterThan(3);
    expect(result.warnings.find((w) => w.code === "NIGHT_SHIFT_OVER_LIMIT")).toBeDefined();
  });
});

describe("シナリオ §8.4 パートの年収上限", () => {
  it("パート 1 名のみで配置すると見込み年収が上限超 → INCOME_CAP_EXCEEDED", () => {
    // 時給 3000 円 × 8h × 22 平日 ≒ 528,000 円 (1 か月) > 上限 300,000
    const result = generateMonthlyShifts(
      input({
        employees: [
          mkEmp(EMP1, "E0001", {
            employmentType: EmploymentType.PART_TIME,
            hourlyWageYen: 3000,
            constraint: { ...baseConstraint, annualIncomeCapYen: 300_000 },
          }),
        ],
        quotas: [
          { shiftPatternId: DAY.id, dayKind: "WEEKDAY", requiredCount: 1 },
          { shiftPatternId: DAY.id, dayKind: "SATURDAY", requiredCount: 0 },
          { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 0 },
        ],
      }),
    );
    const income = result.warnings.find((w) => w.code === "INCOME_CAP_EXCEEDED");
    expect(income).toBeDefined();
  });
});

describe("シナリオ §8.5 前月末 NIGHT_IN の引き継ぎ", () => {
  it("当月 1 日に NIGHT_OUT が入る", () => {
    const result = generateMonthlyShifts(
      input({
        prevMonthNightIn: [{ employeeId: EMP1, workDate: "2026-05-31" }],
      }),
    );
    const no = result.proposedShifts.find(
      (p) =>
        p.employeeId === EMP1 && p.workDate === "2026-06-01" && p.shiftPatternId === NIGHT_OUT.id,
    );
    expect(no).toBeDefined();
    expect(result.warnings.filter((w) => w.code === "PREV_MONTH_NIGHT_HANGING")).toHaveLength(0);
  });

  it("引き継ぎ先日に REQUESTED_OFF があれば配置できず警告", () => {
    const result = generateMonthlyShifts(
      input({
        prevMonthNightIn: [{ employeeId: EMP1, workDate: "2026-05-31" }],
        preferences: [
          { employeeId: EMP1, targetDate: "2026-06-01", preferenceType: "REQUESTED_OFF" },
        ],
      }),
    );
    const hanging = result.warnings.filter((w) => w.code === "PREV_MONTH_NIGHT_HANGING");
    expect(hanging).toHaveLength(1);
  });
});

describe("シナリオ §8.6 既存 shifts の保護と QUOTA_OVERFILLED", () => {
  it("既存 shifts は配置で上書きされない", () => {
    const existing = {
      employeeId: EMP1,
      workDate: "2026-06-08",
      shiftPatternId: DAY.id,
    };
    const result = generateMonthlyShifts(
      input({
        existingShifts: [existing],
      }),
    );
    // proposedShifts には既存 shift と同 (employee, date) の行は出ない (重複を作らない)
    const dup = result.proposedShifts.find(
      (p) => p.employeeId === EMP1 && p.workDate === "2026-06-08",
    );
    expect(dup).toBeUndefined();
  });

  it("既存 shifts が quota より多く乗っていれば QUOTA_OVERFILLED", () => {
    // 平日 1 枠 → 2026-06-08 (月) に 2 人を既存配置
    const result = generateMonthlyShifts(
      input({
        existingShifts: [
          { employeeId: EMP1, workDate: "2026-06-08", shiftPatternId: DAY.id },
          { employeeId: EMP2, workDate: "2026-06-08", shiftPatternId: DAY.id },
        ],
      }),
    );
    const over = result.warnings.find(
      (w) => w.code === "QUOTA_OVERFILLED" && w.date === "2026-06-08",
    );
    expect(over).toBeDefined();
    expect(over).toMatchObject({
      shiftPatternCode: "DAY",
      required: 1,
      filled: 2,
    });
  });
});

describe("シナリオ §8.7 決定論性", () => {
  it("同じ入力 + 同じ seed なら結果が完全一致", () => {
    const a = generateMonthlyShifts(input({ seed: 7777 }));
    const b = generateMonthlyShifts(input({ seed: 7777 }));
    expect(a.proposedShifts).toEqual(b.proposedShifts);
    expect(a.warnings).toEqual(b.warnings);
    // elapsedMs は実行時間で揺れるので比較対象外
    expect({ ...a.stats, elapsedMs: 0 }).toEqual({ ...b.stats, elapsedMs: 0 });
  });
});

describe("シナリオ §8.8 quota 不足", () => {
  it("不足する各 (date, pattern) に対し QUOTA_UNDERFILLED が出る", () => {
    const result = generateMonthlyShifts(
      input({
        // 各日 5 人必要だが従業員は 3 人 → 確実に不足
        quotas: [
          { shiftPatternId: DAY.id, dayKind: "WEEKDAY", requiredCount: 5 },
          { shiftPatternId: DAY.id, dayKind: "SATURDAY", requiredCount: 5 },
          { shiftPatternId: DAY.id, dayKind: "SUNDAY_HOLIDAY", requiredCount: 5 },
        ],
      }),
    );
    const underfilled = result.warnings.filter((w) => w.code === "QUOTA_UNDERFILLED");
    // 30 日すべてで不足するはず
    expect(underfilled.length).toBe(30);
    // 警告の中身は required >= filled
    for (const w of underfilled) {
      if (w.code === "QUOTA_UNDERFILLED") {
        expect(w.required).toBeGreaterThanOrEqual(w.filled);
      }
    }
  });
});
