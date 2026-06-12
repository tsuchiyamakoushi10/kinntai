import { describe, expect, it } from "vitest";

import { assignNightCycle, type NightDay, type NightEmployee } from "@/lib/shift/short/night-cycle";

function days(n: number, nightInRequired = 1): NightDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    nightInRequired,
  }));
}

function emp(
  code: string,
  nightCap: number,
  unavailable: string[] = [],
  preferredNight: string[] = [],
): NightEmployee {
  return {
    id: code,
    employeeCode: code,
    nightCap,
    unavailableDates: new Set(unavailable),
    preferredNightDates: new Set(preferredNight),
  };
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

  it("夜勤希望の日はその人を優先して夜入に割り当てる", () => {
    // 初日(6/01)は通常コード順で A が選ばれるが、B が 6/01 を夜勤希望 → B 優先。
    const members = [emp("A", 5), emp("B", 5, [], ["2026-06-01"])];
    const r = assignNightCycle(days(4), members);
    const m = byDate(r);
    const nightInEmp = [...(m.get("2026-06-01")?.entries() ?? [])].find(
      ([, s]) => s === "夜入",
    )?.[0];
    expect(nightInEmp).toBe("B");
  });

  it("人手が足りていれば、希望を出した人は希望日のみ夜入 (希望を尊重)", () => {
    // A・C は希望なし(全日ローテ可)が 2 名居るので夜勤は回る。B は 6/01 のみ夜勤希望 →
    // 足りているので B は 6/01 だけ。希望外の日には回されない。
    const members = [emp("A", 30), emp("C", 30), emp("B", 30, [], ["2026-06-01"])];
    const r = assignNightCycle(days(10), members);
    const bNightDates = r.assignments
      .filter((a) => a.employeeId === "B" && a.baseSymbol === "夜入")
      .map((a) => a.date);
    expect(bNightDates).toEqual(["2026-06-01"]);
  });

  it("人手が足りなければ、希望を出した人も希望外の日に回して全部埋める", () => {
    // A 1 名(全日可)だけでは連日は組めない(夜明の翌日は塞がる)。夜勤を全部埋めるのが
    // 最優先なので、6/01 のみ希望の B も希望外の日に回される。
    const members = [emp("A", 30), emp("B", 30, [], ["2026-06-01"])];
    const r = assignNightCycle(days(6), members);
    expect(r.unfilledNightDays).toEqual([]); // 全部埋まる
    const bNightDates = r.assignments
      .filter((a) => a.employeeId === "B" && a.baseSymbol === "夜入")
      .map((a) => a.date);
    expect(bNightDates).toContain("2026-06-01"); // 希望日は必ず組む
    expect(bNightDates.length).toBeGreaterThan(1); // 希望外の日にも入って埋める
  });

  it("夜勤専従は希望日のみ夜入 (希望外日には全くローテしない)", () => {
    // 専従 B は希望が空でない (6/02 のみ) → 6/02 だけ夜入。他日は希望を出していない A が担当。
    const a = emp("A", 30);
    const b: NightEmployee = { ...emp("B", 30, [], ["2026-06-02"]), nightOnly: true };
    const r = assignNightCycle(days(10), [a, b]);
    const bNightDates = r.assignments
      .filter((x) => x.employeeId === "B" && x.baseSymbol === "夜入")
      .map((x) => x.date);
    expect(bNightDates).toEqual(["2026-06-02"]);
  });

  it("夜勤専従で希望が空なら夜勤に一切入らない", () => {
    // 通常従業員は希望が空だと全日ローテ対象だが、専従は希望が無ければ夜勤ゼロ。
    const b: NightEmployee = { ...emp("B", 30), nightOnly: true };
    const r = assignNightCycle(days(10), [emp("A", 30), b]);
    const usedB = r.assignments.some((x) => x.employeeId === "B");
    expect(usedB).toBe(false);
  });

  it("夜勤不可 (cap 0) は割り当てない", () => {
    const r = assignNightCycle(days(10), [emp("A", 5), emp("X", 0), emp("Y", 0)]);
    const usedX = r.assignments.some((a) => a.employeeId === "X");
    const usedY = r.assignments.some((a) => a.employeeId === "Y");
    expect(usedX).toBe(false);
    expect(usedY).toBe(false);
  });

  it("空く日が出るなら月の上限を超えてでも埋める", () => {
    // 2 名で 20 日・各上限 5。上限内なら計 10 回しか置けないが、夜勤は全部埋めるのが
    // 最優先なので上限を超えて 20 日ぶん埋める。
    const r = assignNightCycle(days(20), [emp("A", 5), emp("B", 5)]);
    expect(r.unfilledNightDays).toEqual([]);
    const ca = r.nightCountByEmployee["A"] ?? 0;
    const cb = r.nightCountByEmployee["B"] ?? 0;
    expect(ca + cb).toBe(20); // 全 20 日ぶん埋まる
    expect(Math.max(ca, cb)).toBeGreaterThan(5); // 上限 5 を超えている
  });

  it("上限内で足りるうちは上限を超えない (超過はやむを得ないときだけ)", () => {
    // 4 名・各上限 5 で 12 日 → 上限内 (各 3 回程度) で収まる。むやみに超えない。
    const r = assignNightCycle(days(12), capable());
    for (const c of ["A", "B", "C", "D"]) {
      expect(r.nightCountByEmployee[c] ?? 0).toBeLessThanOrEqual(5);
    }
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
