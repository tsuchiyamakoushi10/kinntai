import type { DayKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { GenerateDeyResult } from "@/lib/shift/dey/generate";
import { summarizeDeyCoverage, toDeyProposals } from "@/lib/shift/dey/proposals";

function result(over: Partial<GenerateDeyResult> = {}): GenerateDeyResult {
  return {
    assignments: [],
    days: [],
    workDaysByEmployee: {},
    ...over,
  };
}

const PATTERN_IDS = new Map([
  ["デ日", "id-deynichi"],
  ["半日A", "id-hanA"],
  ["公休", "id-off"],
]);

describe("toDeyProposals", () => {
  it("記号を shiftPatternId に解決する", () => {
    const r = result({
      assignments: [
        { employeeId: "e1", date: "2026-06-01", baseSymbol: "デ日" },
        { employeeId: "e2", date: "2026-06-01", baseSymbol: "半日A" },
        { employeeId: "e3", date: "2026-06-01", baseSymbol: "公休" },
      ],
    });
    const { proposedShifts, missingSymbols } = toDeyProposals(r, PATTERN_IDS);
    expect(missingSymbols).toEqual([]);
    expect(proposedShifts).toEqual([
      { employeeId: "e1", workDate: "2026-06-01", shiftPatternId: "id-deynichi" },
      { employeeId: "e2", workDate: "2026-06-01", shiftPatternId: "id-hanA" },
      { employeeId: "e3", workDate: "2026-06-01", shiftPatternId: "id-off" },
    ]);
  });

  it("対応IDの無い記号は除外し missingSymbols に記録", () => {
    const r = result({
      assignments: [
        { employeeId: "e1", date: "2026-06-01", baseSymbol: "デ日" },
        { employeeId: "e2", date: "2026-06-01", baseSymbol: "デ短A" }, // map に無い
      ],
    });
    const { proposedShifts, missingSymbols } = toDeyProposals(r, PATTERN_IDS);
    expect(proposedShifts).toHaveLength(1);
    expect(missingSymbols).toEqual(["デ短A"]);
  });
});

describe("summarizeDeyCoverage", () => {
  const dk = (d: DayKind) => d;
  it("営業日/充足日/不足日/相談員不足日を集計する", () => {
    const r = result({
      days: [
        // 休業日 (集計対象外)
        { date: "2026-06-07", dayKind: dk("SUNDAY_HOLIDAY"), operating: false, coverage: null },
        // 充足 (相談員も満たす)
        {
          date: "2026-06-01",
          dayKind: dk("WEEKDAY"),
          operating: true,
          coverage: {
            presence: { am: 7, pm: 5 },
            counselor: { am: 1, pm: 1 },
            nurse: { am: 0, pm: 0 },
            amShortfall: 0,
            pmShortfall: 0,
            counselorAmShort: false,
            counselorPmShort: false,
            nurseAmShort: false,
            nursePmShort: false,
          },
        },
        // 午前不足 + 相談員不足
        {
          date: "2026-06-02",
          dayKind: dk("WEEKDAY"),
          operating: true,
          coverage: {
            presence: { am: 5, pm: 5 },
            counselor: { am: 0, pm: 0 },
            nurse: { am: 0, pm: 0 },
            amShortfall: 2,
            pmShortfall: 0,
            counselorAmShort: true,
            counselorPmShort: true,
            nurseAmShort: false,
            nursePmShort: false,
          },
        },
      ],
    });
    const s = summarizeDeyCoverage(r);
    expect(s.operatingDays).toBe(2);
    expect(s.filledDays).toBe(1);
    expect(s.amPmShortfallDays).toEqual(["2026-06-02"]);
    expect(s.counselorShortDays).toEqual(["2026-06-02"]);
  });
});
