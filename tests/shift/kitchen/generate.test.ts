import { describe, expect, it } from "vitest";

import {
  generateKitchen,
  type GenerateKitchenInput,
  type KitchenConfig,
  type KitchenEmployee,
} from "@/lib/shift/kitchen/generate";

const CONFIG: KitchenConfig = {
  maxConsecutiveDays: 6,
  offSymbol: "公休",
  demandByDayKind: {
    WEEKDAY: ["厨房A", "厨房B"],
    SATURDAY: ["厨房A", "厨房B"],
    SUNDAY_HOLIDAY: ["厨房A", "厨房B"],
  },
};

function emp(code: string, unavailable: string[] = []): KitchenEmployee {
  return { id: `id-${code}`, employeeCode: code, unavailableDates: new Set(unavailable) };
}

/** 連続する平日を n 日ぶん作る (2026-06-01 月〜)。 */
function weekdays(n: number): GenerateKitchenInput["days"] {
  const days = [];
  for (let d = 1; d <= n; d++) {
    days.push({ date: `2026-06-${String(d).padStart(2, "0")}`, dayKind: "WEEKDAY" as const });
  }
  return days;
}

describe("generateKitchen — 毎日2名のローテ", () => {
  it("各営業日にちょうど2名 (厨房A/厨房B)、残り1名は公休", () => {
    const result = generateKitchen({
      days: weekdays(1),
      employees: [emp("E1"), emp("E2"), emp("E3")],
      config: CONFIG,
    });
    const day1 = result.assignments.filter((a) => a.date === "2026-06-01");
    const work = day1.filter((a) => a.baseSymbol !== "公休");
    expect(work.map((a) => a.baseSymbol).sort()).toEqual(["厨房A", "厨房B"]);
    expect(day1.filter((a) => a.baseSymbol === "公休")).toHaveLength(1);
    expect(result.days[0]!.filled).toBe(2);
    expect(result.days[0]!.shortfall).toBe(0);
  });

  it("記号は需要の順 (1人目=厨房A, 2人目=厨房B)", () => {
    const result = generateKitchen({
      days: weekdays(1),
      employees: [emp("E1"), emp("E2"), emp("E3")],
      config: CONFIG,
    });
    // 初日は全員 workDays=0・consecutive=0 なので employeeCode 順 (E1,E2)。
    const byEmp = new Map(result.assignments.map((a) => [a.employeeId, a.baseSymbol]));
    expect(byEmp.get("id-E1")).toBe("厨房A");
    expect(byEmp.get("id-E2")).toBe("厨房B");
    expect(byEmp.get("id-E3")).toBe("公休");
  });

  it("出勤日数が3名で平等に分散する (偏り ≤ 1)", () => {
    const result = generateKitchen({
      days: weekdays(15),
      employees: [emp("E1"), emp("E2"), emp("E3")],
      config: CONFIG,
    });
    const counts = Object.values(result.workDaysByEmployee);
    // 15日 × 2枠 = 30 出勤 / 3名 = 各10
    expect(counts.reduce((a, b) => a + b, 0)).toBe(30);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("generateKitchen — 制約", () => {
  it("希望休/勤務不可の人はその日に勤務しない", () => {
    const result = generateKitchen({
      days: weekdays(1),
      employees: [emp("E1", ["2026-06-01"]), emp("E2"), emp("E3")],
      config: CONFIG,
    });
    const e1 = result.assignments.find((a) => a.employeeId === "id-E1" && a.date === "2026-06-01");
    expect(e1!.baseSymbol).toBe("公休");
  });

  it("連勤上限(6)を超えない", () => {
    // 2名しかいないと毎日2名とも出ざるを得ないが、連勤上限で打ち止め → 不足が出る。
    const result = generateKitchen({
      days: weekdays(10),
      employees: [emp("E1"), emp("E2")],
      config: CONFIG,
    });
    // 各従業員の連続出勤が6を超えていないこと
    for (const id of ["id-E1", "id-E2"]) {
      let run = 0;
      for (const d of result.days) {
        const a = result.assignments.find((x) => x.employeeId === id && x.date === d.date)!;
        if (a.baseSymbol !== "公休") {
          run++;
          expect(run).toBeLessThanOrEqual(6);
        } else {
          run = 0;
        }
      }
    }
  });

  it("入れる人が必要数に足りなければ不足になる", () => {
    const result = generateKitchen({
      days: weekdays(1),
      employees: [emp("E1", ["2026-06-01"]), emp("E2", ["2026-06-01"]), emp("E3")],
      config: CONFIG,
    });
    expect(result.days[0]!.filled).toBe(1);
    expect(result.days[0]!.shortfall).toBe(1);
  });

  it("需要が無い日種は休業 (全員公休)", () => {
    const result = generateKitchen({
      days: [{ date: "2026-06-07", dayKind: "SUNDAY_HOLIDAY" }],
      employees: [emp("E1"), emp("E2"), emp("E3")],
      config: { ...CONFIG, demandByDayKind: { WEEKDAY: ["厨房A"] } }, // 日祝の需要なし
    });
    expect(result.days[0]!.operating).toBe(false);
    expect(result.assignments.every((a) => a.baseSymbol === "公休")).toBe(true);
  });
});

describe("generateKitchen — 決定論", () => {
  it("同じ入力なら同じ結果", () => {
    const input: GenerateKitchenInput = {
      days: weekdays(8),
      employees: [emp("E3"), emp("E1"), emp("E2")], // 順不同でも安定
      config: CONFIG,
    };
    expect(generateKitchen(input)).toEqual(generateKitchen(input));
  });
});
