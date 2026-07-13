import { describe, expect, it } from "vitest";

import type { SymbolCoverage, SymbolMaster } from "../coverage";
import { generateDey, type DeyEmployee, type GenerateDeyInput } from "./generate";

/** テスト用の勤務記号マスター (デイ既定記号 + 事務 / 実績周り。いずれも午前1・午後1)。 */
function master(): SymbolMaster {
  const full = (name: string): [string, SymbolCoverage] => [
    name,
    { baseSymbol: name, amCount: 1, pmCount: 1, isNight: false, isEarly: true, band: "終日" },
  ];
  const zero = (name: string): [string, SymbolCoverage] => [
    name,
    { baseSymbol: name, amCount: 0, pmCount: 0, isNight: false, band: "休" },
  ];
  return new Map([
    full("デ日"),
    full("デ短A"),
    full("デ短D"),
    full("事務"),
    full("実績周り"),
    [
      "半日A",
      { baseSymbol: "半日A", amCount: 1, pmCount: 0, isNight: false, isEarly: true, band: "午前" },
    ],
    [
      "半日D",
      { baseSymbol: "半日D", amCount: 1, pmCount: 0, isNight: false, isEarly: true, band: "午前" },
    ],
    zero("公休"),
    zero("有休"),
  ]);
}

function manager(overrides: Partial<DeyEmployee> = {}): DeyEmployee {
  return {
    id: "mgr",
    employeeCode: "E0001",
    isFullTime: true,
    isCounselor: false,
    unavailableDates: new Set(),
    paidLeaveDates: new Set(),
    managerDutyDates: new Map(),
    halfDayOnly: false,
    targetWorkDays: 21,
    ...overrides,
  };
}

function symbolOn(
  result: ReturnType<typeof generateDey>,
  employeeId: string,
  date: string,
): string | undefined {
  return result.assignments.find((a) => a.employeeId === employeeId && a.date === date)?.baseSymbol;
}

describe("generateDey 管理者の事務日 / 実績周り日", () => {
  const days = [
    { date: "2025-06-02", dayKind: "WEEKDAY" as const },
    { date: "2025-06-03", dayKind: "WEEKDAY" as const },
  ];
  const demandByDayKind = { WEEKDAY: { am: 1, pm: 1, counselorAm: 0, counselorPm: 0, earlyAm: 0 } };

  function run(employees: DeyEmployee[]): ReturnType<typeof generateDey> {
    const input: GenerateDeyInput = { days, employees, demandByDayKind, master: master() };
    return generateDey(input);
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
    // 需要 午前1・午後1 を管理者の事務(午前1・午後1)だけで満たせる。
    const mgr = manager({ managerDutyDates: new Map([["2025-06-02", "事務"]]) });
    const result = run([mgr]);
    const day = result.days.find((d) => d.date === "2025-06-02");
    expect(day?.coverage?.amShortfall).toBe(0);
    expect(day?.coverage?.pmShortfall).toBe(0);
  });

  it("希望休より事務日を優先する (指定日に休みが入らない)", () => {
    // 同じ日に不可日 (希望休相当) があっても、事務日指定があれば事務で出す。
    const mgr = manager({
      managerDutyDates: new Map([["2025-06-02", "事務"]]),
      unavailableDates: new Set(["2025-06-02"]),
    });
    const result = run([mgr]);
    expect(symbolOn(result, "mgr", "2025-06-02")).toBe("事務");
  });

  it("相談員でもある管理者の事務日を相談員フェーズが上書きしない", () => {
    const mgr = manager({
      isCounselor: true,
      managerDutyDates: new Map([["2025-06-02", "事務"]]),
    });
    const demandWithCounselor = {
      WEEKDAY: { am: 1, pm: 1, counselorAm: 1, counselorPm: 1, earlyAm: 0 },
    };
    const result = generateDey({
      days,
      employees: [mgr],
      demandByDayKind: demandWithCounselor,
      master: master(),
    });
    expect(symbolOn(result, "mgr", "2025-06-02")).toBe("事務");
  });
});
