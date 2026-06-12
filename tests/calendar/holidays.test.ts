import { DayKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  SUPPORTED_YEAR_RANGE,
  dayKindFor,
  holidayName,
  holidaysInMonth,
  isHoliday,
} from "@/lib/calendar/holidays";

describe("isHoliday", () => {
  it("元日は祝日", () => {
    expect(isHoliday("2026-01-01")).toBe(true);
  });

  it("祝日の翌日（月曜・振替対象外）は祝日ではない", () => {
    expect(isHoliday("2026-01-02")).toBe(false);
  });

  it("振替休日を祝日と判定する (2025-05-06)", () => {
    expect(isHoliday("2025-05-06")).toBe(true);
  });

  it("国民の休日を祝日と判定する (2026-09-22)", () => {
    expect(isHoliday("2026-09-22")).toBe(true);
  });

  it("対応範囲外の年は throw する", () => {
    expect(() => isHoliday("2023-01-01")).toThrow(/範囲外/);
    expect(() => isHoliday("2031-01-01")).toThrow(/範囲外/);
  });

  it("不正な日付形式は throw する", () => {
    expect(() => isHoliday("2026/01/01")).toThrow(/invalid/);
  });
});

describe("holidayName", () => {
  it("祝日名を返す", () => {
    expect(holidayName("2026-05-05")).toBe("こどもの日");
    expect(holidayName("2025-05-06")).toBe("振替休日");
  });

  it("平日は null", () => {
    expect(holidayName("2026-05-07")).toBeNull();
  });
});

describe("dayKindFor", () => {
  it("平日の月曜は WEEKDAY", () => {
    // 2026-05-11 (月)
    expect(dayKindFor("2026-05-11")).toBe(DayKind.WEEKDAY);
  });

  it("土曜は SATURDAY", () => {
    // 2026-05-09 (土)
    expect(dayKindFor("2026-05-09")).toBe(DayKind.SATURDAY);
  });

  it("日曜は SUNDAY_HOLIDAY", () => {
    // 2026-05-10 (日)
    expect(dayKindFor("2026-05-10")).toBe(DayKind.SUNDAY_HOLIDAY);
  });

  it("平日の祝日は HOLIDAY (日曜と別区分)", () => {
    // 2026-05-05 (火) こどもの日
    expect(dayKindFor("2026-05-05")).toBe(DayKind.HOLIDAY);
  });

  it("振替休日も HOLIDAY", () => {
    // 2026-05-06 (水) 振替休日
    expect(dayKindFor("2026-05-06")).toBe(DayKind.HOLIDAY);
  });

  it("国民の休日 (祝日に挟まれた平日) も HOLIDAY", () => {
    // 2024-09-23 (月・振替休日)。祝日優先で HOLIDAY。
    expect(dayKindFor("2024-09-23")).toBe(DayKind.HOLIDAY);
  });
});

describe("holidaysInMonth", () => {
  it("5 月 GW を返す", () => {
    const may = holidaysInMonth("2026-05");
    expect(may).toEqual(["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06"]);
  });

  it("祝日が無い月は空配列", () => {
    expect(holidaysInMonth("2026-06")).toEqual([]);
  });

  it("不正な YYYY-MM は throw する", () => {
    expect(() => holidaysInMonth("2026-13")).toThrow(/invalid/);
  });

  it("範囲外は throw する", () => {
    expect(() => holidaysInMonth("2023-01")).toThrow(/範囲外/);
  });
});

describe("SUPPORTED_YEAR_RANGE", () => {
  it("最小年 / 最大年で isHoliday が動く", () => {
    expect(isHoliday(`${SUPPORTED_YEAR_RANGE.min}-01-01`)).toBe(true);
    expect(isHoliday(`${SUPPORTED_YEAR_RANGE.max}-01-01`)).toBe(true);
  });
});
