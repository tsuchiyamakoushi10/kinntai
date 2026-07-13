import { describe, expect, it } from "vitest";

import type { SymbolCoverage, SymbolMaster } from "../coverage";
import { generateShort, type GenerateShortInput, type ShortEmployee } from "./generate";

/** テスト用の勤務記号マスター (ショート既定記号 + 事務 / 実績周り。いずれも午前1・午後1)。 */
function master(): SymbolMaster {
  const full = (name: string): [string, SymbolCoverage] => [
    name,
    { baseSymbol: name, amCount: 1, pmCount: 1, isNight: false, band: "終日" },
  ];
  const zero = (name: string): [string, SymbolCoverage] => [
    name,
    { baseSymbol: name, amCount: 0, pmCount: 0, isNight: false, band: "休" },
  ];
  return new Map([
    full("ショ日"),
    full("ショ短A"),
    full("事務"),
    full("実績周り"),
    ["半日A", { baseSymbol: "半日A", amCount: 1, pmCount: 0, isNight: false, band: "午前" }],
    zero("公休"),
    zero("有休"),
  ]);
}

function manager(overrides: Partial<ShortEmployee> = {}): ShortEmployee {
  return {
    id: "mgr",
    employeeCode: "E0001",
    isFullTime: true,
    isCounselor: false,
    isNurse: false,
    unavailableDates: new Set(),
    targetWorkDays: 21,
    nightCap: 0,
    preferredNightDates: new Set(),
    paidLeaveDates: new Set(),
    managerDutyDates: new Map(),
    ...overrides,
  };
}

function symbolOn(
  result: ReturnType<typeof generateShort>,
  employeeId: string,
  date: string,
): string | undefined {
  return result.assignments.find((a) => a.employeeId === employeeId && a.date === date)?.baseSymbol;
}

describe("generateShort 管理者の事務日 / 実績周り日", () => {
  const days = [
    { date: "2025-06-02", dayKind: "WEEKDAY" as const },
    { date: "2025-06-03", dayKind: "WEEKDAY" as const },
  ];
  // 夜勤なし (nightIn:0)、午前1・午後1。
  const demandByDayKind = {
    WEEKDAY: { am: 1, pm: 1, counselorAm: 0, counselorPm: 0, nurseAm: 0, nursePm: 0, nightIn: 0 },
  };

  function run(employees: ShortEmployee[]): ReturnType<typeof generateShort> {
    const input: GenerateShortInput = { days, employees, demandByDayKind, master: master() };
    return generateShort(input);
  }

  it("事務日は『事務』で固定配置し公休を入れない", () => {
    const mgr = manager({ managerDutyDates: new Map([["2025-06-02", "事務"]]) });
    const result = run([mgr]);
    expect(symbolOn(result, "mgr", "2025-06-02")).toBe("事務");
  });

  it("実績周り日は『実績周り』で固定配置する", () => {
    const mgr = manager({ managerDutyDates: new Map([["2025-06-03", "実績周り"]]) });
    const result = run([mgr]);
    expect(symbolOn(result, "mgr", "2025-06-03")).toBe("実績周り");
  });

  it("事務日・実績周り日は出勤日数にカウントする", () => {
    const mgr = manager({
      managerDutyDates: new Map([
        ["2025-06-02", "事務"],
        ["2025-06-03", "実績周り"],
      ]),
    });
    const result = run([mgr]);
    expect(result.workDaysByEmployee["mgr"]).toBe(2);
  });

  it("事務日はフロア人数にカウントし、その日の不足を解消する", () => {
    const mgr = manager({ managerDutyDates: new Map([["2025-06-02", "事務"]]) });
    const result = run([mgr]);
    const day = result.days.find((d) => d.date === "2025-06-02");
    expect(day?.coverage?.amShortfall).toBe(0);
    expect(day?.coverage?.pmShortfall).toBe(0);
  });

  it("希望休より事務日を優先する (指定日に休みが入らない)", () => {
    const mgr = manager({
      managerDutyDates: new Map([["2025-06-02", "事務"]]),
      unavailableDates: new Set(["2025-06-02"]),
    });
    const result = run([mgr]);
    expect(symbolOn(result, "mgr", "2025-06-02")).toBe("事務");
  });
});
