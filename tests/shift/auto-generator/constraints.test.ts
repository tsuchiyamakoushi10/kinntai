import { DayKind, EmploymentType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildMonthDays,
  buildUnavailableDays,
  findOffPattern,
  isWorkShiftKind,
  monthlyRequiredWorkDays,
  resolveHangingNightOut,
} from "@/lib/shift/auto-generator/constraints";
import type {
  EmployeeForGen,
  PatternForGen,
  PreferenceForGen,
} from "@/lib/shift/auto-generator/types";

const baseConstraint = {
  maxMonthlyWorkMinutes: null,
  maxNightShiftsPerMonth: null,
  allowNightShiftOverride: true,
  targetMonthlyWorkDays: null,
  annualIncomeCapYen: null,
  unavailableDaysOfWeek: [] as number[],
};

const baseEmployee = (overrides: Partial<EmployeeForGen> = {}): EmployeeForGen => ({
  id: "11111111-1111-1111-1111-111111111111",
  employeeCode: "E0001",
  employmentType: EmploymentType.FULL_TIME,
  joinedOn: "2024-01-01",
  isOnLeave: false,
  weeklyWorkDays: 5,
  hourlyWageYen: null,
  retiredOn: null,
  constraint: { ...baseConstraint },
  ...overrides,
});

describe("buildMonthDays", () => {
  it("月内の日数分の DayInfo を返す (2026-06 は 30 日)", () => {
    const days = buildMonthDays("2026-06");
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe("2026-06-01");
    expect(days[29]?.date).toBe("2026-06-30");
  });

  it("月内の祝日は SUNDAY_HOLIDAY 判定", () => {
    const days = buildMonthDays("2026-05");
    const may5 = days.find((d) => d.date === "2026-05-05");
    expect(may5).toBeDefined();
    expect(may5!.dayKind).toBe(DayKind.SUNDAY_HOLIDAY);
    expect(may5!.isHoliday).toBe(true);
  });

  it("土曜は SATURDAY (祝日でない場合)", () => {
    const days = buildMonthDays("2026-06");
    // 2026-06-06 は土
    const sat = days.find((d) => d.date === "2026-06-06");
    expect(sat?.dayKind).toBe(DayKind.SATURDAY);
    expect(sat?.isHoliday).toBe(false);
  });

  it("不正な YYYY-MM は throw", () => {
    expect(() => buildMonthDays("2026-13")).toThrow(/invalid/);
  });
});

describe("buildUnavailableDays", () => {
  it("不可曜日が当月の該当曜日を全部不可日に入れる", () => {
    const employees = [
      baseEmployee({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        constraint: { ...baseConstraint, unavailableDaysOfWeek: [0, 6] },
      }),
    ];
    const days = buildMonthDays("2026-06");
    const map = buildUnavailableDays(employees, days, [], []);
    const unavail = map.get("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!;
    // 2026-06 の土日: 6, 7, 13, 14, 20, 21, 27, 28
    expect(unavail.has("2026-06-06")).toBe(true);
    expect(unavail.has("2026-06-07")).toBe(true);
    expect(unavail.has("2026-06-13")).toBe(true);
    expect(unavail.has("2026-06-08")).toBe(false); // 月曜
  });

  it("REQUESTED_OFF と UNAVAILABLE を不可日に入れる", () => {
    const employees = [baseEmployee()];
    const days = buildMonthDays("2026-06");
    const prefs: PreferenceForGen[] = [
      {
        employeeId: baseEmployee().id,
        targetDate: "2026-06-10",
        preferenceType: "REQUESTED_OFF",
      },
      {
        employeeId: baseEmployee().id,
        targetDate: "2026-06-15",
        preferenceType: "UNAVAILABLE",
      },
      {
        // PREFERRED_NIGHT は不可日には入れない
        employeeId: baseEmployee().id,
        targetDate: "2026-06-20",
        preferenceType: "PREFERRED_NIGHT",
      },
    ];
    const map = buildUnavailableDays(employees, days, prefs, []);
    const unavail = map.get(baseEmployee().id)!;
    expect(unavail.has("2026-06-10")).toBe(true);
    expect(unavail.has("2026-06-15")).toBe(true);
    expect(unavail.has("2026-06-20")).toBe(false);
  });

  it("既存シフト占有日を不可日に入れる", () => {
    const employees = [baseEmployee()];
    const days = buildMonthDays("2026-06");
    const map = buildUnavailableDays(
      employees,
      days,
      [],
      [
        {
          employeeId: baseEmployee().id,
          workDate: "2026-06-12",
          shiftPatternId: "patternX",
        },
      ],
    );
    expect(map.get(baseEmployee().id)?.has("2026-06-12")).toBe(true);
  });

  it("入社日前 / 退職日後を不可日に入れる", () => {
    const employees = [baseEmployee({ joinedOn: "2026-06-10", retiredOn: "2026-06-20" })];
    const days = buildMonthDays("2026-06");
    const map = buildUnavailableDays(employees, days, [], []);
    const unavail = map.get(baseEmployee().id)!;
    expect(unavail.has("2026-06-09")).toBe(true);
    expect(unavail.has("2026-06-10")).toBe(false);
    expect(unavail.has("2026-06-20")).toBe(false);
    expect(unavail.has("2026-06-21")).toBe(true);
  });
});

describe("resolveHangingNightOut", () => {
  const nightOutPattern: PatternForGen = {
    id: "pattern-night-out",
    code: "NIGHT_OUT",
    name: "夜明",
    shiftKind: "NIGHT_OUT",
    officeId: null,
    sortOrder: 100,
    workMinutes: 480,
    crossesMidnight: false,
  };

  it("前月末 NIGHT_IN を持つ従業員に対し、当月 1 日の NIGHT_OUT を返す", () => {
    const result = resolveHangingNightOut(
      [{ employeeId: "emp1", workDate: "2026-05-31" }],
      [nightOutPattern],
      "2026-06",
    );
    expect(result).toEqual([
      {
        employeeId: "emp1",
        workDate: "2026-06-01",
        shiftPatternId: "pattern-night-out",
      },
    ]);
  });

  it("NIGHT_OUT パターンが無い場合 shiftPatternId は null (警告対象)", () => {
    const result = resolveHangingNightOut(
      [{ employeeId: "emp1", workDate: "2026-05-31" }],
      [],
      "2026-06",
    );
    expect(result[0]?.shiftPatternId).toBeNull();
  });

  it("前月末 NIGHT_IN が無ければ空配列", () => {
    expect(resolveHangingNightOut([], [nightOutPattern], "2026-06")).toEqual([]);
  });
});

describe("monthlyRequiredWorkDays", () => {
  it("週 5 日 × 30 日月 → ceil(30/7)=5 → 25 日", () => {
    expect(monthlyRequiredWorkDays(5, 30)).toBe(25);
  });

  it("週 3 日 × 30 日月 → 15 日", () => {
    expect(monthlyRequiredWorkDays(3, 30)).toBe(15);
  });

  it("週 3.5 日 × 31 日月 → ceil(31/7)=5 → 17.5 → 18 (四捨五入)", () => {
    expect(monthlyRequiredWorkDays(3.5, 31)).toBe(18);
  });

  it("週 0 日は 0", () => {
    expect(monthlyRequiredWorkDays(0, 30)).toBe(0);
  });
});

describe("isWorkShiftKind", () => {
  it("WORK / NIGHT_IN / NIGHT_OUT は true", () => {
    expect(isWorkShiftKind("WORK")).toBe(true);
    expect(isWorkShiftKind("NIGHT_IN")).toBe(true);
    expect(isWorkShiftKind("NIGHT_OUT")).toBe(true);
  });

  it("休み系は false", () => {
    expect(isWorkShiftKind("OFF")).toBe(false);
    expect(isWorkShiftKind("PAID_LEAVE")).toBe(false);
    expect(isWorkShiftKind("ABSENCE")).toBe(false);
    expect(isWorkShiftKind("REQUESTED_OFF")).toBe(false);
  });
});

describe("findOffPattern", () => {
  const sharedOff: PatternForGen = {
    id: "shared-off",
    code: "OFF",
    name: "公休",
    shiftKind: "OFF",
    officeId: null,
    sortOrder: 100,
    workMinutes: 0,
    crossesMidnight: false,
  };
  const localOff: PatternForGen = {
    id: "local-off",
    code: "OFF_LOCAL",
    name: "公休 (拠点)",
    shiftKind: "OFF",
    officeId: "office-1",
    sortOrder: 50,
    workMinutes: 0,
    crossesMidnight: false,
  };

  it("拠点固有 OFF を優先", () => {
    expect(findOffPattern([sharedOff, localOff], "office-1")?.id).toBe("local-off");
  });

  it("拠点固有が無ければ共通 OFF を返す", () => {
    expect(findOffPattern([sharedOff], "office-1")?.id).toBe("shared-off");
  });

  it("OFF が一つも無ければ null", () => {
    const work: PatternForGen = {
      id: "work-1",
      code: "DAY",
      name: "日勤",
      shiftKind: "WORK",
      officeId: null,
      sortOrder: 1,
      workMinutes: 480,
      crossesMidnight: false,
    };
    expect(findOffPattern([work], "office-1")).toBeNull();
  });
});
