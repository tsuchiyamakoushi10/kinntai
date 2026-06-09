import { describe, expect, it } from "vitest";

import { isDeyOffice, NRS_SHORT_CONFIG, shortConfigForOffice } from "@/lib/shift/office-generator";
import { parseSymbolMaster, type SymbolMaster } from "@/lib/shift/coverage";
import {
  generateShort,
  SHORT_DEFAULT_CONFIG,
  type GenerateShortInput,
  type ShortEmployee,
} from "@/lib/shift/short/generate";

describe("office-generator — 拠点→生成種別の対応", () => {
  it("DAY-CENTER はデイ生成", () => {
    expect(isDeyOffice("DAY-CENTER")).toBe(true);
    expect(isDeyOffice("SHO-CENTER")).toBe(false);
    expect(isDeyOffice("NRS-CENTER")).toBe(false);
  });

  it("SHO-CENTER はショート既定設定", () => {
    expect(shortConfigForOffice("SHO-CENTER")).toBe(SHORT_DEFAULT_CONFIG);
  });

  it("NRS-CENTER はショート系で、終日記号が日勤", () => {
    const cfg = shortConfigForOffice("NRS-CENTER");
    expect(cfg).toBe(NRS_SHORT_CONFIG);
    expect(cfg?.symbols.fullDay).toBe("日勤");
    expect(cfg?.symbols.partFullDay).toBe("日勤");
    expect(cfg?.symbols.partAm).toBe("半日A");
  });

  it("デイ拠点・未知の拠点はショート設定を返さない", () => {
    expect(shortConfigForOffice("DAY-CENTER")).toBeNull();
    expect(shortConfigForOffice("UNKNOWN")).toBeNull();
  });
});

// NRS 設定で generateShort を回すと、常勤の終日が「ショ日」ではなく「日勤」になることを保証する
// (記号設定の配線が効いているかの番人)。記号カウントは実 CSV を正とする。
describe("generateShort × NRS設定 — 記号が差し替わる", () => {
  const master: SymbolMaster = parseSymbolMaster(
    [
      "基本記号,開始,終了,時間帯区分,午前カウント,午後カウント,夜勤,想定事業所,備考",
      "日勤,8:15,17:15,終日,1,1,0,共通,",
      "半日A,9:00,12:00,午前,1,0,0,共通,",
      "夜入,16:30,24:00,夜勤,0,0,1,ショート,",
      "夜明,0:00,8:30,夜勤明け,0,0,1,ショート,",
    ].join("\n"),
  );

  const fullTimer: ShortEmployee = {
    id: "ft1",
    employeeCode: "E0001",
    isFullTime: true,
    isCounselor: false,
    isNurse: false,
    unavailableDates: new Set(),
    targetWorkDays: 21,
    nightCap: 0, // 夜勤は無効化してこのテストでは日中配置だけ見る
    preferredNightDates: new Set(),
  };

  const input: GenerateShortInput = {
    days: [{ date: "2026-06-01", dayKind: "WEEKDAY" }],
    employees: [fullTimer],
    demandByDayKind: {
      WEEKDAY: { am: 1, pm: 1, counselorAm: 0, counselorPm: 0, nurseAm: 0, nursePm: 0, nightIn: 0 },
    },
    master,
    config: NRS_SHORT_CONFIG,
  };

  it("常勤の終日記号が 日勤 になる", () => {
    const result = generateShort(input);
    const work = result.assignments.find((a) => a.employeeId === "ft1" && a.date === "2026-06-01");
    expect(work?.baseSymbol).toBe("日勤");
  });
});
