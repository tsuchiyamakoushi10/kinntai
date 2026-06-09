import type { DayKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { SymbolCoverage, SymbolMaster } from "@/lib/shift/coverage";
import {
  DEY_DEFAULT_CONFIG,
  generateDey,
  type DeyDay,
  type DeyEmployee,
  type DeyDemand,
  type GenerateDeyInput,
} from "@/lib/shift/dey/generate";

// テスト用の記号マスター (デ日/デ短A=終日, 半日A=午前, 公休=休)。
function cov(baseSymbol: string, am: number, pm: number): [string, SymbolCoverage] {
  return [baseSymbol, { baseSymbol, amCount: am, pmCount: pm, isNight: false, band: "" }];
}
const MASTER: SymbolMaster = new Map([
  cov("デ日", 1, 1),
  cov("デ短A", 1, 1),
  cov("半日A", 1, 0),
  cov("公休", 0, 0),
]);

const WEEKDAY_DEMAND: DeyDemand = { am: 7, pm: 5, counselorAm: 1, counselorPm: 1 };

function emp(code: string, isFullTime: boolean, opts: Partial<DeyEmployee> = {}): DeyEmployee {
  return {
    id: code,
    employeeCode: code,
    isFullTime,
    isCounselor: opts.isCounselor ?? false,
    unavailableDates: opts.unavailableDates ?? new Set(),
    targetWorkDays: opts.targetWorkDays ?? 21,
  };
}

// 平日 N 日ぶん (デイは日祝休業、ここでは平日のみで検証)。
function weekdays(n: number): DeyDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    dayKind: "WEEKDAY" as DayKind,
  }));
}

function baseInput(over: Partial<GenerateDeyInput> = {}): GenerateDeyInput {
  return {
    days: weekdays(1),
    employees: [
      ...["F1", "F2", "F3"].map((c) => emp(c, true)),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ],
    demandByDayKind: { WEEKDAY: WEEKDAY_DEMAND },
    master: MASTER,
    config: DEY_DEFAULT_CONFIG,
    ...over,
  };
}

function symbolsOn(r: ReturnType<typeof generateDey>, date: string): Map<string, string> {
  return new Map(
    r.assignments.filter((a) => a.date === date).map((a) => [a.employeeId, a.baseSymbol]),
  );
}

describe("generateDey — 休業日", () => {
  it("必要数 0 の日種は全員公休", () => {
    const r = generateDey(
      baseInput({
        days: [{ date: "2026-06-07", dayKind: "SUNDAY_HOLIDAY" }],
        demandByDayKind: { WEEKDAY: WEEKDAY_DEMAND }, // 日祝の定義なし → 休業
      }),
    );
    const day = symbolsOn(r, "2026-06-07");
    expect([...day.values()].every((s) => s === "公休")).toBe(true);
    expect(r.days[0]!.operating).toBe(false);
    expect(r.days[0]!.coverage).toBeNull();
  });
});

describe("generateDey — 平日の配置", () => {
  it("常勤はデ日、非常勤がデ短A/半日Aで午前7・午後5を満たす", () => {
    const r = generateDey(baseInput());
    const day = symbolsOn(r, "2026-06-01");

    // 常勤3名は全員デ日
    expect(day.get("F1")).toBe("デ日");
    expect(day.get("F2")).toBe("デ日");
    expect(day.get("F3")).toBe("デ日");

    // 過不足なし (午前7/午後5)
    const ev = r.days[0]!.coverage!;
    expect(ev.presence).toEqual({ am: 7, pm: 5 });
    expect(ev.amShortfall).toBe(0);
    expect(ev.pmShortfall).toBe(0);

    // 非常勤は デ短A(終日) と 半日A(午前) の組み合わせ。PM=5 は 常勤3+終日2。
    const partFull = [...day.entries()].filter(([, s]) => s === "デ短A").length;
    const partAm = [...day.entries()].filter(([, s]) => s === "半日A").length;
    expect(partFull).toBe(2);
    expect(partAm).toBe(2);
  });

  it("相談員が居なければ相談員不足を警告する", () => {
    const ev = generateDey(baseInput()).days[0]!.coverage!;
    expect(ev.counselorAmShort).toBe(true);
    expect(ev.counselorPmShort).toBe(true);
  });

  it("人員が足りなければ不足として出る", () => {
    const r = generateDey(
      baseInput({ employees: [emp("F1", true), emp("P1", false), emp("P2", false)] }),
    );
    const ev = r.days[0]!.coverage!;
    // 常勤1(デ日)+非常勤2 → 最大 午前3。午前7/午後5 に届かない
    expect(ev.amShortfall).toBeGreaterThan(0);
    expect(ev.pmShortfall).toBeGreaterThan(0);
  });
});

describe("generateDey — 制約", () => {
  it("希望休の人はその日に勤務しない (公休)", () => {
    const employees = [
      ...["F1", "F2", "F3"].map((c) => emp(c, true)),
      emp("P1", false, { unavailableDates: new Set(["2026-06-01"]) }),
      ...["P2", "P3", "P4", "P5"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ employees }));
    expect(symbolsOn(r, "2026-06-01").get("P1")).toBe("公休");
  });

  it("連勤上限 (6) を超えない", () => {
    const r = generateDey(baseInput({ days: weekdays(10) }));
    // どの職員も 7 連勤以上にならない
    const byEmp = new Map<string, string[]>();
    for (const a of r.assignments) {
      if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, []);
      byEmp.get(a.employeeId)!.push(a.baseSymbol);
    }
    for (const [, syms] of byEmp) {
      let run = 0;
      let maxRun = 0;
      for (const s of syms) {
        run = s === "公休" ? 0 : run + 1;
        maxRun = Math.max(maxRun, run);
      }
      expect(maxRun).toBeLessThanOrEqual(DEY_DEFAULT_CONFIG.maxConsecutiveDays);
    }
  });

  it("非常勤の出勤日数が平等に分散する (偏り ≤ 1)", () => {
    const r = generateDey(baseInput({ days: weekdays(12) }));
    const partCounts = ["P1", "P2", "P3", "P4", "P5", "P6"].map(
      (c) => r.workDaysByEmployee[c] ?? 0,
    );
    expect(Math.max(...partCounts) - Math.min(...partCounts)).toBeLessThanOrEqual(1);
  });

  it("常勤の出勤が月内で均等に分散する (月末がスカスカにならない)", () => {
    // 26 営業日・目標 21 日。素朴に前詰めすると 21 日到達後の月末 5 日が全休になる。
    const employees = [
      emp("F1", true, { targetWorkDays: 21 }),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ days: weekdays(26), employees }));

    // 月末 5 営業日 (22〜26 日) にも出勤が残っている
    const lastFive = ["22", "23", "24", "25", "26"].map(
      (dd) => symbolsOn(r, `2026-06-${dd}`).get("F1") ?? "公休",
    );
    expect(lastFive.some((s) => s !== "公休")).toBe(true);

    // 前半 13 日と後半 13 日の出勤数が大きく偏らない
    const workIn = (from: number, to: number) =>
      r.assignments.filter(
        (a) =>
          a.employeeId === "F1" &&
          a.baseSymbol !== "公休" &&
          Number(a.date.slice(8)) >= from &&
          Number(a.date.slice(8)) <= to,
      ).length;
    const firstHalf = workIn(1, 13);
    const secondHalf = workIn(14, 26);
    expect(Math.abs(firstHalf - secondHalf)).toBeLessThanOrEqual(3);
  });

  it("常勤は目標出勤日数で頭打ちになる", () => {
    const employees = [
      ...["F1", "F2", "F3"].map((c) => emp(c, true, { targetWorkDays: 3 })),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ days: weekdays(8), employees }));
    expect(r.workDaysByEmployee["F1"]).toBe(3);
    expect(r.workDaysByEmployee["F2"]).toBe(3);
  });
});

describe("generateDey — 相談員の確保 (Phase 0)", () => {
  it("非常勤の相談員でも毎営業日に確保される (連勤上限内)", () => {
    const employees = [
      ...["F1", "F2", "F3"].map((c) => emp(c, true)),
      emp("C1", false, { isCounselor: true }),
      ...["P1", "P2", "P3", "P4", "P5"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ days: weekdays(5), employees }));
    for (const day of r.days) {
      expect(day.coverage!.counselorAmShort).toBe(false);
      expect(day.coverage!.counselorPmShort).toBe(false);
    }
    // 非常勤相談員は終日 (デ短A) で配置され、5 日とも出勤
    expect(symbolsOn(r, "2026-06-01").get("C1")).toBe("デ短A");
    expect(r.workDaysByEmployee["C1"]).toBe(5);
  });

  it("相談員は月目標日数を超えても確保される (カバレッジ優先)", () => {
    const employees = [
      emp("C1", false, { isCounselor: true, targetWorkDays: 2 }),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ days: weekdays(5), employees }));
    expect(r.workDaysByEmployee["C1"]).toBe(5); // 目標 2 を超えて 5 日確保
    for (const day of r.days) expect(day.coverage!.counselorAmShort).toBe(false);
  });

  it("複数相談員がいれば必要数だけ置き、負担を分散する", () => {
    const employees = [
      ...["C1", "C2"].map((c) => emp(c, true, { isCounselor: true })),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ];
    // counselorAm/Pm=1 なので 1 日 1 名だけ確保 → 負担が分散する
    const r = generateDey(baseInput({ days: weekdays(6), employees }));
    const diff = Math.abs((r.workDaysByEmployee["C1"] ?? 0) - (r.workDaysByEmployee["C2"] ?? 0));
    expect(diff).toBeLessThanOrEqual(1);
    for (const day of r.days) expect(day.coverage!.counselorAmShort).toBe(false);
  });

  it("相談員が希望休の日は確保されず不足が残る", () => {
    const employees = [
      emp("C1", false, { isCounselor: true, unavailableDates: new Set(["2026-06-02"]) }),
      ...["P1", "P2", "P3", "P4", "P5", "P6"].map((c) => emp(c, false)),
    ];
    const r = generateDey(baseInput({ days: weekdays(3), employees }));
    expect(symbolsOn(r, "2026-06-02").get("C1")).toBe("公休");
    const d2 = r.days.find((d) => d.date === "2026-06-02")!;
    expect(d2.coverage!.counselorAmShort).toBe(true);
  });
});

describe("generateDey — 決定論", () => {
  it("同じ入力なら同じ結果", () => {
    const a = generateDey(baseInput({ days: weekdays(10) }));
    const b = generateDey(baseInput({ days: weekdays(10) }));
    expect(a.assignments).toEqual(b.assignments);
  });
});
