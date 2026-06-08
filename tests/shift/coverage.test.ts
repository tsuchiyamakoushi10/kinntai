import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  countPresence,
  countCounselorPresence,
  evaluateCoverage,
  parseSymbolMaster,
  type DayAssignment,
  type SymbolMaster,
} from "@/lib/shift/coverage";

// 設計書 原則4: 勤務記号マスター_確定.csv を唯一の正とする。
// テストは実ファイルを読み、既知の行が期待どおりに解釈されることを確認する。
const CSV = readFileSync(join(process.cwd(), "勤務記号マスター_確定.csv"), "utf8");
const master: SymbolMaster = parseSymbolMaster(CSV);

describe("parseSymbolMaster (実CSV)", () => {
  it("終日記号は午前1・午後1", () => {
    expect(master.get("日勤")).toMatchObject({ amCount: 1, pmCount: 1, isNight: false });
    expect(master.get("デ短A")).toMatchObject({ amCount: 1, pmCount: 1, isNight: false });
  });

  it("午前のみ記号は午前1・午後0", () => {
    expect(master.get("半日A")).toMatchObject({ amCount: 1, pmCount: 0, band: "午前" });
    expect(master.get("日/有")).toMatchObject({ amCount: 1, pmCount: 0 });
  });

  it("午後のみ記号は午前0・午後1", () => {
    expect(master.get("半日午後")).toMatchObject({ amCount: 0, pmCount: 1, band: "午後" });
    expect(master.get("有/日")).toMatchObject({ amCount: 0, pmCount: 1 });
  });

  it("夜勤系は isNight=true・在席0", () => {
    expect(master.get("夜入")).toMatchObject({ amCount: 0, pmCount: 0, isNight: true });
    expect(master.get("夜明")).toMatchObject({ amCount: 0, pmCount: 0, isNight: true });
  });

  it("配置基準外 (厨房 / 休) は在席0", () => {
    expect(master.get("厨房A")).toMatchObject({ amCount: 0, pmCount: 0 });
    expect(master.get("公休")).toMatchObject({ amCount: 0, pmCount: 0 });
    expect(master.get("有休")).toMatchObject({ amCount: 0, pmCount: 0 });
  });

  it("DB に合わせ追記した記号 (デ日/半日E/ショ日) も終日/午前で取り込む", () => {
    expect(master.get("デ日")).toMatchObject({ amCount: 1, pmCount: 1 });
    expect(master.get("ショ日")).toMatchObject({ amCount: 1, pmCount: 1 });
    expect(master.get("半日E")).toMatchObject({ amCount: 1, pmCount: 0, band: "午前" });
  });

  it("想定どおりの記号数を取り込む", () => {
    // CSV のデータ行 (ヘッダ除く) すべてが入る
    expect(master.size).toBe(33);
  });

  it("ヘッダが壊れていれば例外", () => {
    expect(() => parseSymbolMaster("壊れた,ヘッダ\n日勤,8:15")).toThrow();
  });
});

describe("countPresence", () => {
  it("終日2 + 午前のみ1 → 午前3・午後2", () => {
    const day: DayAssignment[] = [
      { employeeId: "a", baseSymbol: "日勤" },
      { employeeId: "b", baseSymbol: "デ短A" },
      { employeeId: "c", baseSymbol: "半日A" },
    ];
    expect(countPresence(day, master)).toEqual({ am: 3, pm: 2 });
  });

  it("公休・夜入・不明記号は在席に数えない", () => {
    const day: DayAssignment[] = [
      { employeeId: "a", baseSymbol: "日勤" },
      { employeeId: "b", baseSymbol: "公休" },
      { employeeId: "c", baseSymbol: "夜入" },
      { employeeId: "d", baseSymbol: "存在しない記号" },
    ];
    expect(countPresence(day, master)).toEqual({ am: 1, pm: 1 });
  });
});

describe("countCounselorPresence", () => {
  const day: DayAssignment[] = [
    { employeeId: "soudan-am", baseSymbol: "半日A" }, // 相談員・午前のみ
    { employeeId: "soudan-allday", baseSymbol: "日勤" }, // 相談員・終日
    { employeeId: "other", baseSymbol: "日勤" }, // 相談員でない
  ];
  const counselors = new Set(["soudan-am", "soudan-allday"]);
  const isCounselor = (id: string) => counselors.has(id);

  it("相談員だけを数える", () => {
    expect(countCounselorPresence(day, master, isCounselor)).toEqual({ am: 2, pm: 1 });
  });
});

describe("evaluateCoverage", () => {
  const isCounselor = (id: string) => id === "soudan";

  it("デイ平日 午前7/午後5・相談員午前午後1 を満たすと不足なし", () => {
    const day: DayAssignment[] = [
      { employeeId: "soudan", baseSymbol: "日勤" }, // 相談員 終日
      ...Array.from({ length: 4 }, (_, i) => ({ employeeId: `f${i}`, baseSymbol: "デ短A" })), // 終日4
      ...Array.from({ length: 2 }, (_, i) => ({ employeeId: `p${i}`, baseSymbol: "半日A" })), // 午前2
    ];
    // 午前 = 1+4+2 = 7, 午後 = 1+4 = 5
    const r = evaluateCoverage(
      day,
      master,
      { am: 7, pm: 5, counselorAm: 1, counselorPm: 1 },
      isCounselor,
    );
    expect(r.presence).toEqual({ am: 7, pm: 5 });
    expect(r.amShortfall).toBe(0);
    expect(r.pmShortfall).toBe(0);
    expect(r.counselorAmShort).toBe(false);
    expect(r.counselorPmShort).toBe(false);
  });

  it("人数不足・相談員不在を検出する", () => {
    const day: DayAssignment[] = [
      { employeeId: "x", baseSymbol: "日勤" }, // 相談員でない 終日
      { employeeId: "y", baseSymbol: "半日A" }, // 午前のみ
    ];
    // 午前2・午後1。相談員0。
    const r = evaluateCoverage(
      day,
      master,
      { am: 7, pm: 5, counselorAm: 1, counselorPm: 1 },
      isCounselor,
    );
    expect(r.amShortfall).toBe(5);
    expect(r.pmShortfall).toBe(4);
    expect(r.counselorAmShort).toBe(true);
    expect(r.counselorPmShort).toBe(true);
  });

  it("相談員チェックを使わない拠点 (counselor=0) は相談員不足にならない", () => {
    const day: DayAssignment[] = [{ employeeId: "x", baseSymbol: "日勤" }];
    const r = evaluateCoverage(
      day,
      master,
      { am: 1, pm: 1, counselorAm: 0, counselorPm: 0 },
      () => false,
    );
    expect(r.counselorAmShort).toBe(false);
    expect(r.counselorPmShort).toBe(false);
  });
});
