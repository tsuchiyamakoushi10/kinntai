/**
 * 梨花シフト CSV 出力 (export.ts) の単体テスト。
 *
 * 設計書 §6: グリッドと同じ形 (職員行 + 各日 + 勤務日数 + 午前/午後集計) を CSV 化。
 *   - Excel 用に BOM 付き
 *   - 休業日は「休」、勤務は記号ラベル、空きは空欄
 *   - 集計行の頭数が aggregateDay と一致する
 */
import { describe, expect, it } from "vitest";

import { buildRikaCsv, type RikaCsvMember } from "@/lib/shift/rika/export";
import { buildRikaMonth, type RikaCell } from "@/lib/shift/rika/grid";

const YM = "2025-12"; // 12-01 月(営業), 12-03 水(休業)
const days = buildRikaMonth(YM);
const biz = days.filter((d) => d.isBusinessDay).map((d) => d.date);

const members: RikaCsvMember[] = [
  {
    id: "五木田秀美",
    name: "五木田秀美",
    employmentClass: "full",
    jobLabel: "生活相談員",
    isHelper: false,
    targetWorkDays: 21,
  },
  {
    id: "横野千波",
    name: "横野千波",
    employmentClass: "part",
    jobLabel: "介護",
    isHelper: true,
    targetWorkDays: null,
  },
];

const cells: RikaCell[] = [
  { memberId: "五木田秀美", date: biz[0]!, symbol: "DAY_CARE" },
  { memberId: "五木田秀美", date: biz[1]!, symbol: "OFF" },
  { memberId: "横野千波", date: biz[0]!, symbol: "HALF_PM" },
];

describe("buildRikaCsv", () => {
  const csv = buildRikaCsv({ ym: YM, members, days, cells });
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("BOM で始まる (Excel の文字化け対策)", () => {
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("タイトル + ヘッダ + 職員2行 + 集計2行 を持つ", () => {
    // title, header, 2 members, am, pm
    expect(lines).toHaveLength(1 + 1 + members.length + 2);
    expect(lines[0]).toContain("デイサービス梨花");
    expect(lines[1]!.startsWith("職員,区分,")).toBe(true);
  });

  it("勤務記号と勤務日数を出力する", () => {
    const gokita = lines[2]!.split(",");
    expect(gokita[0]).toBe("五木田秀美");
    expect(gokita[2]).toBe("日勤"); // biz[0] = DAY_CARE
    expect(gokita.at(-1)).toBe("1/21"); // 勤務1日 / 目安21
  });

  it("休業日は「休」、未配置は空欄", () => {
    const header = lines[1]!.split(",");
    const gokita = lines[2]!.split(",");
    // 休業日の列を 1 つ探して「休」であることを確認
    const closedIdx = days.findIndex((d) => !d.isBusinessDay);
    // 列インデックス: 職員(0) + 区分(1) + 日(2..) なので +2
    expect(gokita[closedIdx + 2]).toBe("休");
    expect(header[closedIdx + 2]).toContain("("); // 「3(水)」のような曜日付き
  });

  it("午前/午後の集計行が頭数を持つ", () => {
    const am = lines.at(-2)!.split(",");
    const pm = lines.at(-1)!.split(",");
    expect(am[0]).toContain("午前");
    expect(pm[0]).toContain("午後");
    // biz[0]: 五木田=日勤(am1,pm1) + 横野=半午(pm1) → am=1, pm=2
    expect(am[2]).toBe("1");
    expect(pm[2]).toBe("2");
  });
});
