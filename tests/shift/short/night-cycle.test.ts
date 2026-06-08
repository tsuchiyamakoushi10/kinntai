import { describe, expect, it } from "vitest";

import { assignNightCycle, type NightDay, type NightEmployee } from "@/lib/shift/short/night-cycle";

function days(n: number, nightInRequired = 1): NightDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    nightInRequired,
  }));
}

function emp(code: string, nightCap: number, unavailable: string[] = []): NightEmployee {
  return { id: code, employeeCode: code, nightCap, unavailableDates: new Set(unavailable) };
}

/** date -> (employeeId -> baseSymbol) */
function byDate(r: ReturnType<typeof assignNightCycle>): Map<string, Map<string, string>> {
  const m = new Map<string, Map<string, string>>();
  for (const a of r.assignments) {
    if (!m.has(a.date)) m.set(a.date, new Map());
    m.get(a.date)!.set(a.employeeId, a.baseSymbol);
  }
  return m;
}

describe("assignNightCycle", () => {
  const capable = () => [emp("A", 5), emp("B", 5), emp("C", 5), emp("D", 5)];

  it("毎日 夜入が1名だけ置かれる", () => {
    const r = assignNightCycle(days(20), capable());
    expect(r.unfilledNightDays).toEqual([]);
    const m = byDate(r);
    for (const d of days(20)) {
      const ins = [...(m.get(d.date)?.values() ?? [])].filter((s) => s === "夜入").length;
      expect(ins).toBe(1);
    }
  });

  it("夜入の翌日は同じ人が夜明", () => {
    const r = assignNightCycle(days(10), capable());
    const m = byDate(r);
    const all = days(10);
    for (let i = 0; i < all.length - 1; i++) {
      const today = m.get(all[i]!.date)!;
      const nightInEmp = [...today.entries()].find(([, s]) => s === "夜入")?.[0];
      expect(nightInEmp).toBeDefined();
      expect(m.get(all[i + 1]!.date)!.get(nightInEmp!)).toBe("夜明");
    }
  });

  it("夜勤不可 (cap 0) は割り当てない", () => {
    const r = assignNightCycle(days(10), [emp("A", 5), emp("X", 0), emp("Y", 0)]);
    const usedX = r.assignments.some((a) => a.employeeId === "X");
    const usedY = r.assignments.some((a) => a.employeeId === "Y");
    expect(usedX).toBe(false);
    expect(usedY).toBe(false);
  });

  it("月の上限を超えない", () => {
    // 2 名で 20 日、各上限 5 → 計 10 回しか置けない → 残りは未充足
    const r = assignNightCycle(days(20), [emp("A", 5), emp("B", 5)]);
    expect(r.nightCountByEmployee["A"]).toBeLessThanOrEqual(5);
    expect(r.nightCountByEmployee["B"]).toBeLessThanOrEqual(5);
    expect(r.unfilledNightDays.length).toBeGreaterThan(0);
  });

  it("夜勤回数が偏らない (差 ≤ 1)", () => {
    const r = assignNightCycle(days(12), capable());
    const counts = ["A", "B", "C", "D"].map((c) => r.nightCountByEmployee[c] ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("当日が希望休なら夜入にしない", () => {
    const r = assignNightCycle(days(5), [emp("A", 5, ["2026-06-03"]), emp("B", 5), emp("C", 5)]);
    const m = byDate(r);
    expect(m.get("2026-06-03")!.get("A")).toBeUndefined();
  });

  it("翌日が希望休なら夜入にしない (夜明を希望休に乗せない)", () => {
    // A は 6/4 が希望休。6/3 に夜入すると 6/4 が夜明になるので 6/3 の夜入から外れる。
    const r = assignNightCycle(days(5), [emp("A", 5, ["2026-06-04"]), emp("B", 5), emp("C", 5)]);
    const m = byDate(r);
    expect(m.get("2026-06-03")!.get("A")).toBeUndefined();
  });

  it("夜明の翌日が preferredOff に入る", () => {
    const r = assignNightCycle(days(5), capable());
    // 6/1 夜入 → 6/2 夜明 → 6/3 が preferredOff
    const m = byDate(r);
    const firstIn = [...m.get("2026-06-01")!.entries()].find(([, s]) => s === "夜入")![0];
    expect(r.preferredOff.has(`${firstIn}|2026-06-03`)).toBe(true);
  });

  it("候補が居なければ未充足日になる", () => {
    const r = assignNightCycle(days(3), [emp("X", 0)]);
    expect(r.unfilledNightDays).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(r.assignments).toEqual([]);
  });

  it("同じ入力なら同じ結果 (決定論)", () => {
    const a = assignNightCycle(days(15), capable());
    const b = assignNightCycle(days(15), capable());
    expect(a.assignments).toEqual(b.assignments);
  });
});
