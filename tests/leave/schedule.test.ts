import { describe, expect, it } from "vitest";

import { addYearsYmd, dueGrants, firstGrantDate, nextGrantDate } from "@/lib/leave/schedule";

describe("firstGrantDate", () => {
  it("4/1 入社は 10/1 に初回付与", () => {
    expect(firstGrantDate("2025-04-01")).toBe("2025-10-01");
  });
  it("年跨ぎ: 10/15 入社は翌年 4/15", () => {
    expect(firstGrantDate("2025-10-15")).toBe("2026-04-15");
  });
  it("月末入社の月跨ぎクリップ (8/31 → 翌 2/28 or 29)", () => {
    expect(firstGrantDate("2025-08-31")).toBe("2026-02-28"); // 2026 はうるう年でない
  });
});

describe("addYearsYmd", () => {
  it("通常の年加算", () => {
    expect(addYearsYmd("2025-05-19", 1)).toBe("2026-05-19");
  });
  it("うるう年 2/29 → 翌年 2/28 にクリップ", () => {
    expect(addYearsYmd("2024-02-29", 1)).toBe("2025-02-28");
  });
});

describe("nextGrantDate", () => {
  it("未付与なら 6 か月後", () => {
    expect(nextGrantDate("2025-04-01", null)).toBe("2025-10-01");
  });
  it("前回 2025-10-01 → 次回 2026-10-01", () => {
    expect(nextGrantDate("2025-04-01", "2025-10-01")).toBe("2026-10-01");
  });
});

describe("dueGrants", () => {
  it("4/1 入社、3 年後の同日基準で 3 回分付与する (初回 + 2 周年)", () => {
    const dues = dueGrants("2025-04-01", "2028-04-01");
    expect(dues.map((d) => d.grantedOn)).toEqual(["2025-10-01", "2026-10-01", "2027-10-01"]);
  });

  it("経過月数が正しく出る", () => {
    const dues = dueGrants("2025-04-01", "2028-04-01");
    expect(dues.map((d) => d.monthsSinceHired)).toEqual([6, 18, 30]);
  });

  it("既付与の日付は除外", () => {
    const dues = dueGrants("2025-04-01", "2028-04-01", {
      already: ["2025-10-01", "2026-10-01"],
    });
    expect(dues.map((d) => d.grantedOn)).toEqual(["2027-10-01"]);
  });

  it("asOf が初回付与日より前なら空配列", () => {
    const dues = dueGrants("2025-04-01", "2025-08-01");
    expect(dues).toEqual([]);
  });

  it("退職済み従業員は退職日以降の付与を含めない", () => {
    const dues = dueGrants("2025-04-01", "2028-04-01", { retiredOn: "2026-03-31" });
    expect(dues.map((d) => d.grantedOn)).toEqual(["2025-10-01"]);
  });

  it("無限ループしない (100 年分でも返ってくる)", () => {
    const dues = dueGrants("2025-04-01", "2125-04-01");
    expect(dues.length).toBeGreaterThan(0);
    expect(dues.length).toBeLessThanOrEqual(100);
  });
});
