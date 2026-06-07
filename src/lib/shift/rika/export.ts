/**
 * 梨花シフト表の CSV 出力 (設計書 §6「出力」)。
 *
 * 現場の使い方: 組んだシフトを Excel で開いて確認・微修正したり、印刷して
 * 貼り出したりするための CSV を作る。Excel が日本語を文字化けしないよう
 * 先頭に BOM を付け、値はダブルクォートで囲んでエスケープする。
 *
 * 形は画面のグリッドに合わせる:
 *   行 = 職員、列 = その月の各日 (営業日のみ記号、休業日は「休」)、右端に勤務日数。
 *   末尾に「午前」「午後」の頭数集計行を付ける。
 *
 * 本モジュールは DB / React に依存しない純粋関数。同じ入力 → 同じ出力。
 */
import { RIKA_STAFFING, symbolDef, type RikaSymbolCode } from "./config";
import { aggregateDay, countWorkdays, type RikaCell, type RikaDay } from "./grid";

export type RikaCsvMember = {
  id: string;
  name: string;
  employmentClass: "full" | "part";
  jobLabel: string;
  isHelper: boolean;
  targetWorkDays: number | null;
};

export type RikaCsvInput = {
  ym: string;
  members: ReadonlyArray<RikaCsvMember>;
  days: ReadonlyArray<RikaDay>;
  cells: ReadonlyArray<RikaCell>;
};

/** CSV の 1 セルをエスケープする (ダブルクォート / カンマ / 改行を含むと囲む)。 */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(values: ReadonlyArray<string>): string {
  return values.map(csvCell).join(",");
}

/** 職員の属性を「正 / パート・職種・応援」の 1 セルにまとめる。 */
function memberAttr(m: RikaCsvMember): string {
  const cls = m.employmentClass === "full" ? "正" : "パート";
  return `${cls}/${m.jobLabel}${m.isHelper ? "/応援" : ""}`;
}

/** 梨花シフト表を CSV 文字列にする (先頭 BOM 付き)。 */
export function buildRikaCsv(input: RikaCsvInput): string {
  const { ym, members, days, cells } = input;
  const byKey = new Map<string, RikaSymbolCode>();
  for (const c of cells) byKey.set(`${c.memberId}|${c.date}`, c.symbol);

  const rows: string[] = [];

  // タイトル行。
  rows.push(csvRow([`デイサービス梨花 シフト表 ${ym}`]));

  // ヘッダ行: 職員 / 区分 / 各日 (日+曜) / 勤務日数。
  const dayHeaders = days.map((d) => `${d.day}(${d.dowLabel})`);
  rows.push(csvRow(["職員", "区分", ...dayHeaders, "勤務日数"]));

  // 職員行。
  for (const m of members) {
    const cellLabels = days.map((d) => {
      if (!d.isBusinessDay) return "休"; // 休業日
      const sym = byKey.get(`${m.id}|${d.date}`);
      return sym ? symbolDef(sym).label : "";
    });
    const workdays = countWorkdays(cells, m.id);
    const workdayCell =
      m.targetWorkDays != null ? `${workdays}/${m.targetWorkDays}` : String(workdays);
    rows.push(csvRow([m.name, memberAttr(m), ...cellLabels, workdayCell]));
  }

  // 集計行: 午前 / 午後 の頭数 (休業日は空欄)。
  const amCounts = days.map((d) => (d.isBusinessDay ? String(aggregateDay(cells, d.date).am) : ""));
  const pmCounts = days.map((d) => (d.isBusinessDay ? String(aggregateDay(cells, d.date).pm) : ""));
  rows.push(csvRow([`午前 (基準${RIKA_STAFFING.morning})`, "", ...amCounts, ""]));
  rows.push(csvRow([`午後 (基準${RIKA_STAFFING.afternoon})`, "", ...pmCounts, ""]));

  return `﻿${rows.join("\r\n")}\r\n`;
}
