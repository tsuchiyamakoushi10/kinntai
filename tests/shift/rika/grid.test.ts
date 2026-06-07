/**
 * 梨花グリッド集計 (grid.ts) の単体テスト。
 *
 * 設計書 §4 の集計仕様 (午前/午後の頭数、配置基準への充足、勤務日数) を担保する。
 */
import { describe, expect, it } from "vitest";

import {
  aggregateDay,
  buildRikaMonth,
  countWorkdays,
  coverageOf,
  dayCoverage,
  type RikaCell,
} from "@/lib/shift/rika/grid";

describe("buildRikaMonth", () => {
  const days = buildRikaMonth("2025-12"); // 2025-12-01 は月曜

  it("月の全日を返す (12月=31日)", () => {
    expect(days).toHaveLength(31);
    expect(days[0]!.date).toBe("2025-12-01");
    expect(days[30]!.date).toBe("2025-12-31");
  });

  it("月火木金は営業日、水土日は休業日", () => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    expect(byDate.get("2025-12-01")!.isBusinessDay).toBe(true); // 月
    expect(byDate.get("2025-12-02")!.isBusinessDay).toBe(true); // 火
    expect(byDate.get("2025-12-03")!.isBusinessDay).toBe(false); // 水 (休業)
    expect(byDate.get("2025-12-04")!.isBusinessDay).toBe(true); // 木
    expect(byDate.get("2025-12-05")!.isBusinessDay).toBe(true); // 金
    expect(byDate.get("2025-12-06")!.isBusinessDay).toBe(false); // 土
    expect(byDate.get("2025-12-07")!.isBusinessDay).toBe(false); // 日
  });
});

describe("aggregateDay", () => {
  const date = "2025-12-01";
  const cells: RikaCell[] = [
    { memberId: "A", date, symbol: "DAY_CARE" }, // 午前1 午後1
    { memberId: "B", date, symbol: "HALF_F" }, // 午前1 午後0
    { memberId: "C", date, symbol: "HALF_PM" }, // 午前0 午後1
    { memberId: "D", date, symbol: "OFF" }, // 0/0
    { memberId: "E", date: "2025-12-02", symbol: "DAY_CARE" }, // 別日 (無視)
  ];

  it("午前/午後の頭数を勤務記号定義どおりに合算する", () => {
    expect(aggregateDay(cells, date)).toEqual({ am: 2, pm: 2 });
  });

  it("dayCoverage は配置基準 (午前2/午後2) に対する充足を返す", () => {
    const cov = dayCoverage(cells, date);
    expect(cov.counts).toEqual({ am: 2, pm: 2 });
    expect(cov.am).toBe("met");
    expect(cov.pm).toBe("met");
  });
});

describe("coverageOf", () => {
  it("不足 / 充足 / 余剰 を判定する", () => {
    expect(coverageOf(1, 2)).toBe("short");
    expect(coverageOf(2, 2)).toBe("met");
    expect(coverageOf(3, 2)).toBe("surplus");
  });
});

describe("countWorkdays", () => {
  const cells: RikaCell[] = [
    { memberId: "A", date: "2025-12-01", symbol: "DAY_CARE" },
    { memberId: "A", date: "2025-12-02", symbol: "HALF_F" },
    { memberId: "A", date: "2025-12-03", symbol: "OFF" }, // 休み系は除外
    { memberId: "A", date: "2025-12-04", symbol: "PAID_LEAVE" }, // 除外
    { memberId: "B", date: "2025-12-01", symbol: "DAY_CARE" }, // 別人
  ];

  it("休み系を除いた実働日数を数える", () => {
    expect(countWorkdays(cells, "A")).toBe(2);
    expect(countWorkdays(cells, "B")).toBe(1);
  });
});
