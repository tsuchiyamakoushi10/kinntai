import type { DayKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { computeDayShortfalls, type CoverageNeed, type GridCell } from "@/lib/shift/grid-coverage";

const fullDay = (isCounselor = false, isEarly = false, isNurse = false): GridCell => ({
  amCount: 1,
  pmCount: 1,
  isNightIn: false,
  isNightOut: false,
  isCounselor,
  isNurse,
  isEarly,
});
const am = (): GridCell => ({
  amCount: 1,
  pmCount: 0,
  isNightIn: false,
  isNightOut: false,
  isCounselor: false,
  isNurse: false,
  isEarly: false,
});
const nightIn = (): GridCell => ({
  amCount: 0,
  pmCount: 0,
  isNightIn: true,
  isNightOut: false,
  isCounselor: false,
  isNurse: false,
  isEarly: false,
});

const WEEKDAY: CoverageNeed = {
  am: 3,
  pm: 2,
  counselorAm: 1,
  counselorPm: 1,
  nurseAm: 0,
  nursePm: 0,
  earlyAm: 0,
  nightIn: 0,
  nightOut: 0,
};
const demand: Partial<Record<DayKind, CoverageNeed>> = { WEEKDAY };
const days = [{ date: "2026-06-01", dayKind: "WEEKDAY" as DayKind }];

describe("computeDayShortfalls", () => {
  it("必要数を満たしていれば不足なし", () => {
    // 相談員1名(終日) + 終日2 + 午前1 → am=4>=3, pm=3>=2, 相談員 am/pm=1
    const cells = new Map([["2026-06-01", [fullDay(true), fullDay(), fullDay(), am()]]]);
    expect(computeDayShortfalls(days, demand, cells)).toEqual([]);
  });

  it("午前/午後が足りなければ不足数を返す", () => {
    const cells = new Map([["2026-06-01", [fullDay(true)]]]); // am=1,pm=1
    const r = computeDayShortfalls(days, demand, cells);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ am: 2, pm: 1, counselorAm: 0, counselorPm: 0 });
  });

  it("相談員が居なければ相談員不足を返す", () => {
    // 人数は足りるが相談員なし
    const cells = new Map([["2026-06-01", [fullDay(), fullDay(), fullDay()]]]);
    const r = computeDayShortfalls(days, demand, cells);
    expect(r[0]).toMatchObject({ am: 0, pm: 0, counselorAm: 1, counselorPm: 1 });
  });

  it("送迎(earlyAm)が足りなければ送迎不足を返す", () => {
    const need: Partial<Record<DayKind, CoverageNeed>> = {
      WEEKDAY: {
        am: 3,
        pm: 2,
        counselorAm: 0,
        counselorPm: 0,
        nurseAm: 0,
        nursePm: 0,
        earlyAm: 2,
        nightIn: 0,
        nightOut: 0,
      },
    };
    // 終日3名いるが送迎(isEarly)は1名だけ → 送迎が1名不足
    const cells = new Map([["2026-06-01", [fullDay(false, true), fullDay(), fullDay()]]]);
    const r = computeDayShortfalls(days, need, cells);
    expect(r[0]).toMatchObject({ am: 0, pm: 0, earlyAm: 1 });
  });

  it("休業日 (基準なし/必要数0) は対象外", () => {
    const holiday = [{ date: "2026-06-07", dayKind: "SUNDAY_HOLIDAY" as DayKind }];
    expect(computeDayShortfalls(holiday, demand, new Map())).toEqual([]);
  });

  it("夜勤の必要数も評価する", () => {
    const nightDemand: Partial<Record<DayKind, CoverageNeed>> = {
      WEEKDAY: {
        am: 0,
        pm: 0,
        counselorAm: 0,
        counselorPm: 0,
        nurseAm: 0,
        nursePm: 0,
        earlyAm: 0,
        nightIn: 1,
        nightOut: 0,
      },
    };
    const empty = computeDayShortfalls(days, nightDemand, new Map());
    expect(empty[0]).toMatchObject({ nightIn: 1 });
    const filled = new Map([["2026-06-01", [nightIn()]]]);
    expect(computeDayShortfalls(days, nightDemand, filled)).toEqual([]);
  });
});
