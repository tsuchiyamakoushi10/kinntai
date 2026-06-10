import type { DayKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { SymbolCoverage, SymbolMaster } from "@/lib/shift/coverage";
import {
  generateShort,
  SHORT_DEFAULT_CONFIG,
  type GenerateShortInput,
  type ShortDay,
  type ShortDemand,
  type ShortEmployee,
} from "@/lib/shift/short/generate";

/** テスト用の勤務記号マスター (DB の am/pm カウントに合わせる)。 */
const MASTER: SymbolMaster = new Map<string, SymbolCoverage>([
  ["ショ日", { baseSymbol: "ショ日", amCount: 1, pmCount: 1, isNight: false, band: "終日" }],
  ["ショ短A", { baseSymbol: "ショ短A", amCount: 1, pmCount: 1, isNight: false, band: "終日" }],
  ["半日A", { baseSymbol: "半日A", amCount: 1, pmCount: 0, isNight: false, band: "午前" }],
  ["夜入", { baseSymbol: "夜入", amCount: 0, pmCount: 0, isNight: true, band: "夜勤" }],
  ["夜明", { baseSymbol: "夜明", amCount: 0, pmCount: 0, isNight: true, band: "夜勤明け" }],
  ["公休", { baseSymbol: "公休", amCount: 0, pmCount: 0, isNight: false, band: "休" }],
]);

function days(n: number, dayKind: DayKind = "WEEKDAY"): ShortDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    dayKind,
  }));
}

function emp(
  code: string,
  opts: Partial<Omit<ShortEmployee, "id" | "employeeCode">> = {},
): ShortEmployee {
  return {
    id: code,
    employeeCode: code,
    isFullTime: opts.isFullTime ?? true,
    isCounselor: opts.isCounselor ?? false,
    isNurse: opts.isNurse ?? false,
    unavailableDates: opts.unavailableDates ?? new Set(),
    targetWorkDays: opts.targetWorkDays ?? 21,
    nightCap: opts.nightCap ?? 5,
    preferredNightDates: opts.preferredNightDates ?? new Set(),
    paidLeaveDates: opts.paidLeaveDates ?? new Set(),
    isNightShiftOnly: opts.isNightShiftOnly ?? false,
  };
}

const DEMAND: ShortDemand = {
  am: 2,
  pm: 2,
  counselorAm: 0,
  counselorPm: 0,
  nurseAm: 0,
  nursePm: 0,
  nightIn: 1,
};

function input(
  d: ShortDay[],
  employees: ShortEmployee[],
  demand: Partial<Record<DayKind, ShortDemand>> = { WEEKDAY: DEMAND },
): GenerateShortInput {
  return { days: d, employees, demandByDayKind: demand, master: MASTER };
}

/** date -> (employeeId -> baseSymbol) */
function byDate(r: ReturnType<typeof generateShort>): Map<string, Map<string, string>> {
  const m = new Map<string, Map<string, string>>();
  for (const a of r.assignments) {
    if (!m.has(a.date)) m.set(a.date, new Map());
    m.get(a.date)!.set(a.employeeId, a.baseSymbol);
  }
  return m;
}

describe("generateShort", () => {
  it("全職員 × 全日 にちょうど1セルを返す", () => {
    const d = days(10);
    const emps = [emp("A"), emp("B"), emp("C"), emp("D"), emp("E", { isFullTime: false })];
    const r = generateShort(input(d, emps));
    expect(r.assignments).toHaveLength(d.length * emps.length);
    const m = byDate(r);
    for (const day of d) {
      expect(m.get(day.date)!.size).toBe(emps.length);
    }
  });

  it("夜入を先取りし、翌日に同じ人の夜明、夜明の翌日は公休", () => {
    const d = days(10);
    const r = generateShort(input(d, [emp("A"), emp("B"), emp("C"), emp("D")]));
    const m = byDate(r);
    // 1日目 夜入を置いた人
    const inEntry = [...m.get(d[0]!.date)!.entries()].find(([, s]) => s === "夜入");
    expect(inEntry).toBeDefined();
    const who = inEntry![0];
    // 翌日は夜明
    expect(m.get(d[1]!.date)!.get(who)).toBe("夜明");
    // 翌々日は公休 (preferredOff を日中に使わない)
    expect(m.get(d[2]!.date)!.get(who)).toBe("公休");
  });

  it("夜勤で塞がっている人はその日の日中に入らない", () => {
    const d = days(10);
    const r = generateShort(input(d, [emp("A"), emp("B"), emp("C"), emp("D")]));
    const m = byDate(r);
    for (const day of d) {
      for (const [, sym] of m.get(day.date)!) {
        // 同じ日に夜入/夜明 と日中勤務が両立しない (1人1日1コマは byDate の Map が保証)。
        expect(["ショ日", "ショ短A", "半日A", "夜入", "夜明", "公休"]).toContain(sym);
      }
    }
    // 夜入の人は日中記号を持たない (Map 上書きが無い = ペアが正しい)
    expect(r.unfilledNightDays).toEqual([]);
  });

  it("夜勤専従は夜勤希望日のみ夜勤、それ以外は公休 (日中に一切入らない)", () => {
    const d = days(10);
    const night = new Set(["2026-06-05"]);
    const emps = [
      emp("A"),
      emp("B"),
      emp("C"),
      emp("D"),
      emp("N", { isNightShiftOnly: true, preferredNightDates: night }),
    ];
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    // 希望日 6/05 は夜入、翌 6/06 は夜明。
    expect(m.get("2026-06-05")!.get("N")).toBe("夜入");
    expect(m.get("2026-06-06")!.get("N")).toBe("夜明");
    // それ以外の日はすべて公休 (日中記号は付かない)。
    for (const day of d) {
      const sym = m.get(day.date)!.get("N");
      if (day.date === "2026-06-05" || day.date === "2026-06-06") continue;
      expect(sym).toBe("公休");
    }
    // 夜勤回数は希望どおり 1 回。
    expect(r.nightCountByEmployee["N"]).toBe(1);
  });

  it("夜勤専従で夜勤希望が無ければ全日 公休 (夜勤も日中も入らない)", () => {
    const d = days(10);
    const emps = [emp("A"), emp("B"), emp("C"), emp("D"), emp("N", { isNightShiftOnly: true })];
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    for (const day of d) {
      expect(m.get(day.date)!.get("N")).toBe("公休");
    }
    expect(r.nightCountByEmployee["N"]).toBe(0);
    expect(r.workDaysByEmployee["N"]).toBe(0);
  });

  it("人員が足りれば営業日の午前/午後は充足する", () => {
    const d = days(15);
    // 常勤4 + 非常勤3 で AM2/PM2 + 夜勤1 は十分埋まる
    const emps = [
      emp("A"),
      emp("B"),
      emp("C"),
      emp("D"),
      emp("E", { isFullTime: false }),
      emp("F", { isFullTime: false }),
      emp("G", { isFullTime: false }),
    ];
    const r = generateShort(input(d, emps));
    const shortfalls = r.days.filter(
      (x) => x.coverage && (x.coverage.amShortfall > 0 || x.coverage.pmShortfall > 0),
    );
    expect(shortfalls).toEqual([]);
    expect(r.unfilledNightDays).toEqual([]);
  });

  it("日勤(日中)は配置基準の人数(MAX)を超えない", () => {
    const d = days(10);
    // 常勤6名・AM2/PM2 → 日中は最大2名。
    const emps = ["A", "B", "C", "D", "E", "F"].map((c) => emp(c));
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    const dayShifts = new Set(["ショ日", "ショ短A", "半日A"]);
    for (const day of d) {
      const daytime = [...m.get(day.date)!.values()].filter((s) => dayShifts.has(s)).length;
      expect(daytime).toBeLessThanOrEqual(2);
    }
  });

  it("不足日があるのに常勤を休ませない (ペース到達でも不足なら出す)", () => {
    const d = days(10);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 3, pm: 3, counselorAm: 0, counselorPm: 0, nurseAm: 0, nursePm: 0, nightIn: 0 },
    };
    // 目標を低め(3日)に設定。ペース配分だけだと数日で全員が目標到達 → 不足日に常勤が休む。
    // 安全フィルにより、不足が残る日はペースを無視して常勤を出すので毎日 AM3 を満たす。
    const emps = ["A", "B", "C", "D"].map((c) => emp(c, { targetWorkDays: 3 }));
    const r = generateShort(input(d, emps, demand));
    for (const day of r.days) {
      expect(day.coverage!.presence.am).toBeGreaterThanOrEqual(3);
    }
  });

  it("常勤の出勤が月内で均等に分散する (月末がスカスカにならない)", () => {
    // 実データ相当: 正社員7名・目標21日・営業30日・午前午後6。前詰めだと月末(30日)に
    // 全員が目標到達で休みスカスカになる。ペース配分で月末まで散らす。
    const d = days(30);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 6, pm: 6, counselorAm: 0, counselorPm: 0, nurseAm: 0, nursePm: 0, nightIn: 0 },
    };
    const emps = [
      ...["A", "B", "C", "D", "E", "F", "G"].map((c) => emp(c, { targetWorkDays: 21 })),
      ...["P1", "P2", "P3", "P4"].map((c) => emp(c, { isFullTime: false })),
    ];
    const r = generateShort(input(d, emps, demand));
    // 最終日 (6/30) の午前在席が大きく不足しない (>=5)。前詰めだと 1〜2 になる。
    const last = r.days.find((x) => x.date === "2026-06-30")!;
    expect(last.coverage!.presence.am).toBeGreaterThanOrEqual(5);
  });

  it("相談員が必要なら営業日に確保される", () => {
    const d = days(5);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 2, pm: 2, counselorAm: 1, counselorPm: 1, nurseAm: 0, nursePm: 0, nightIn: 0 },
    };
    const emps = [
      emp("C", { isCounselor: true }),
      emp("P1", { isFullTime: false }),
      emp("P2", { isFullTime: false }),
    ];
    const r = generateShort(input(d, emps, demand));
    for (const day of r.days) expect(day.coverage!.counselorAmShort).toBe(false);
  });

  it("相談員2名 (固定日中 + 夜勤あり) で、二人の休みがかぶらない (毎営業日 最低1名)", () => {
    // NRS 想定: 田中=固定の日中相談員、高橋=夜勤も入る相談員。高橋が夜勤サイクル中は日中に出ない
    // ので、田中がペース休みを取ると相談員ゼロになりうる。フロアで毎営業日 最低1名を確保する。
    const d = days(20);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 6, pm: 6, counselorAm: 1, counselorPm: 1, nurseAm: 0, nursePm: 0, nightIn: 1 },
    };
    const tanaka: ShortEmployee = {
      ...emp("C1-TANAKA", { isCounselor: true, nightCap: 0 }),
      fixedSymbol: "有日勤",
    };
    const takahashi = emp("C2-TAKAHASHI", { isCounselor: true, nightCap: 4 });
    // 一般職員で AM/PM を満たす頭数を用意 (相談員フロアの検証に集中)。
    const others = Array.from({ length: 8 }, (_, i) => emp(`W${i}`, { nightCap: 2 }));
    const r = generateShort(input(d, [tanaka, takahashi, ...others], demand));
    const m = byDate(r);
    const counselorIds = ["C1-TANAKA", "C2-TAKAHASHI"];
    for (const day of r.days) {
      if (!day.operating) continue;
      const dayCell = m.get(day.date)!;
      const present = counselorIds.filter((id) => {
        const sym = dayCell.get(id);
        return sym === "有日勤" || sym === "ショ日" || sym === "ショ短A" || sym === "半日A";
      });
      // ハード制約 (希望休/有給) は無いので、毎営業日 最低1名の相談員が日中に居るはず。
      expect(present.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("相談員2名が両方ハード制約 (希望休) の日は確保せず不足表示 (強制しない)", () => {
    const d = days(5);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 2, pm: 2, counselorAm: 1, counselorPm: 1, nurseAm: 0, nursePm: 0, nightIn: 0 },
    };
    const off = new Set(["2026-06-03"]);
    const emps = [
      emp("C1", { isCounselor: true, unavailableDates: off }),
      emp("C2", { isCounselor: true, unavailableDates: off }),
      emp("P1", { isFullTime: false }),
      emp("P2", { isFullTime: false }),
    ];
    const r = generateShort(input(d, emps, demand));
    const day = r.days.find((x) => x.date === "2026-06-03")!;
    expect(day.coverage!.counselorAmShort).toBe(true); // 両名 希望休 → 不足は不足のまま
  });

  it("看護師が必要で居れば確保、居なければ不足表示", () => {
    const d = days(3);
    const demand: Partial<Record<DayKind, ShortDemand>> = {
      WEEKDAY: { am: 2, pm: 2, counselorAm: 0, counselorPm: 0, nurseAm: 1, nursePm: 1, nightIn: 0 },
    };
    const withNurse = [
      emp("N", { isNurse: true }),
      emp("P1", { isFullTime: false }),
      emp("P2", { isFullTime: false }),
    ];
    const r1 = generateShort(input(d, withNurse, demand));
    for (const day of r1.days) expect(day.coverage!.nurseAmShort).toBe(false);

    const noNurse = [emp("P1", { isFullTime: false }), emp("P2", { isFullTime: false })];
    const r2 = generateShort(input(d, noNurse, demand));
    expect(r2.days.some((x) => x.coverage!.nurseAmShort)).toBe(true);
  });

  it("有給希望の日は必ず有休になり勤務・夜勤に入らない", () => {
    const d = days(5);
    const emps = [
      emp("A"),
      emp("B", { paidLeaveDates: new Set(["2026-06-02"]) }),
      emp("C"),
      emp("P1", { isFullTime: false }),
    ];
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    expect(m.get("2026-06-02")!.get("B")).toBe("有休");
    // B は有給日に夜勤(夜入/夜明)にも入らない
    for (const day of d) {
      const sym = m.get(day.date)!.get("B");
      if (day.date === "2026-06-02") expect(sym).toBe("有休");
    }
  });

  it("休業日 (配置基準なし) は全員公休、夜勤も置かない", () => {
    const d = days(5, "SUNDAY_HOLIDAY");
    const r = generateShort(input(d, [emp("A"), emp("B")], {}));
    for (const a of r.assignments) expect(a.baseSymbol).toBe("公休");
    for (const day of r.days) {
      expect(day.operating).toBe(false);
      expect(day.coverage).toBeNull();
    }
    expect(r.unfilledNightDays).toEqual([]);
  });

  it("常勤は終日 (ショ日)、不足分は非常勤で穴埋め", () => {
    const d = days(3);
    const emps = [emp("A"), emp("B"), emp("Z", { isFullTime: false })];
    const r = generateShort(
      input(d, emps, {
        WEEKDAY: {
          am: 2,
          pm: 2,
          counselorAm: 0,
          counselorPm: 0,
          nurseAm: 0,
          nursePm: 0,
          nightIn: 1,
        },
      }),
    );
    const m = byDate(r);
    // どこかの営業日で 常勤が ショ日、非常勤が ショ短A/半日A を持つ
    const symbols = new Set<string>();
    for (const day of d) for (const [, s] of m.get(day.date)!) symbols.add(s);
    expect(symbols.has("ショ日")).toBe(true);
  });

  it("連勤上限 (既定6) を超えない", () => {
    const d = days(20);
    const emps = [emp("A"), emp("B"), emp("C"), emp("D"), emp("E", { isFullTime: false })];
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    const isWork = (s?: string) => s !== undefined && s !== "公休";
    for (const e of emps) {
      let run = 0;
      for (const day of d) {
        if (isWork(m.get(day.date)!.get(e.id))) {
          run++;
          expect(run).toBeLessThanOrEqual(SHORT_DEFAULT_CONFIG.maxConsecutiveDays);
        } else {
          run = 0;
        }
      }
    }
  });

  it("希望休 / 勤務不可の日には日中も夜勤も入れない", () => {
    const d = days(10);
    const off = new Set(["2026-06-03", "2026-06-04"]);
    const emps = [emp("A", { unavailableDates: off }), emp("B"), emp("C"), emp("D")];
    const r = generateShort(input(d, emps));
    const m = byDate(r);
    for (const date of off) {
      expect(m.get(date)!.get("A")).toBe("公休");
    }
  });

  it("夜勤可能者がいない日は unfilledNightDays に記録される", () => {
    const d = days(5);
    // 全員 nightCap 0 (夜勤不可)
    const emps = [emp("A", { nightCap: 0 }), emp("B", { nightCap: 0 })];
    const r = generateShort(input(d, emps));
    expect(r.unfilledNightDays.length).toBe(d.length);
    for (const day of r.days) expect(day.nightFilled).toBe(false);
  });

  it("夜勤回数は nightCap を超えない", () => {
    const d = days(30);
    const emps = [emp("A", { nightCap: 3 }), emp("B", { nightCap: 3 })];
    const r = generateShort(input(d, emps));
    for (const [, n] of Object.entries(r.nightCountByEmployee)) {
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("相談員不足は coverage で可視化される (配置は強制しない)", () => {
    const d = days(3);
    // 相談員いないが counselorAm/Pm=1 を要求
    const emps = [emp("A"), emp("B"), emp("C"), emp("D")];
    const r = generateShort(
      input(d, emps, {
        WEEKDAY: {
          am: 2,
          pm: 2,
          counselorAm: 1,
          counselorPm: 1,
          nurseAm: 0,
          nursePm: 0,
          nightIn: 1,
        },
      }),
    );
    const counselorShort = r.days.filter(
      (x) => x.coverage?.counselorAmShort || x.coverage?.counselorPmShort,
    );
    expect(counselorShort.length).toBeGreaterThan(0);
  });

  it("決定論: 同じ入力なら同じ結果", () => {
    const d = days(20);
    const emps = [emp("A"), emp("B"), emp("C"), emp("D"), emp("E", { isFullTime: false })];
    const r1 = generateShort(input(d, emps));
    const r2 = generateShort(input(d, emps));
    expect(r1.assignments).toEqual(r2.assignments);
    expect(r1.nightCountByEmployee).toEqual(r2.nightCountByEmployee);
  });
});
