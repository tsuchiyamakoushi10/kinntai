/**
 * 梨花の確定メンバー 6 名を、社員マスター CSV と突き合わせて一覧表示する。
 *
 * 設計書 §6-1 の「抽出された 6 名を一覧表示して確認させる (ここで一旦止める)」用。
 * DB 不要・読み取りのみ。実行: `pnpm tsx scripts/rika-members.ts`
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveRikaMembers, symbolLabels, type MasterRow } from "../src/lib/shift/rika/members";
import { RIKA_BUSINESS_DOW, RIKA_STAFFING } from "../src/lib/shift/rika/config";

// 設計書 §1 が参照する「シフト用」マスター。兼務先・夜勤可否などシフト専用列を持つ。
const CSV_PATH = path.resolve(process.cwd(), "社員マスター_シフト用.csv");

/** 単純カンマ区切りパーサ (このマスター CSV は引用符・セル内カンマを含まない)。 */
function parseMasterCsv(text: string): MasterRow[] {
  // 先頭に BOM のみの空行があるため、空行を除いた最初の行をヘッダとして扱う。
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const headers = lines[0]!.split(",");
  const idx = (label: string): number => headers.indexOf(label);
  const iName = idx("氏名");
  const iOffice = idx("拠点コード");
  const iKenmu = idx("兼務先");
  const iEmp = idx("雇用形態");
  const iJob = idx("職種(推定)");

  return lines.slice(1).map((line) => {
    const c = line.split(",");
    return {
      name: (c[iName] ?? "").trim(),
      officeCode: (c[iOffice] ?? "").trim(),
      kenmuSaki: (c[iKenmu] ?? "").trim(),
      employmentType: (c[iEmp] ?? "").trim(),
      jobCategory: (c[iJob] ?? "").trim(),
    };
  });
}

function main(): void {
  const text = readFileSync(CSV_PATH, "utf8");
  const master = parseMasterCsv(text);
  const resolved = resolveRikaMembers(master);

  const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
  console.log("=== デイサービス梨花 (DAY-RIKKA) シフト対象メンバー ===");
  console.log(
    `営業日: ${RIKA_BUSINESS_DOW.map((d) => dowNames[d]).join("・")} / ` +
      `配置基準: 午前${RIKA_STAFFING.morning}名・午後${RIKA_STAFFING.afternoon}名`,
  );
  console.log("");

  for (const r of resolved) {
    const m = r.roster;
    const cls = m.employmentClass === "full" ? "正社員系" : "パート";
    const tags = [
      m.isHelper ? "兼務応援" : null,
      m.amOnly ? "午前のみ" : null,
      m.pmOnly ? "午後のみ" : null,
      m.targetWorkDays ? `目安${m.targetWorkDays}日` : null,
    ].filter(Boolean);

    console.log(`■ ${m.name}  [${cls} / ${m.jobLabel}]${tags.length ? "  " + tags.join(" ") : ""}`);
    console.log(`   配置可能: ${symbolLabels(m).join(" / ")}`);
    if (r.master) {
      console.log(
        `   マスター: ${r.master.name} (拠点 ${r.master.officeCode || "空欄"} / ${r.master.employmentType || "雇用形態空欄"})`,
      );
    }
    if (r.discrepancies.length > 0) {
      for (const d of r.discrepancies) console.log(`   ⚠ ${d}`);
    } else {
      console.log("   ✓ マスターと一致");
    }
    console.log("");
  }

  const flagged = resolved.filter((r) => r.discrepancies.length > 0).length;
  console.log(
    `合計 ${resolved.length} 名 (うち要確認 ${flagged} 名)。配置ロジックは設計書 (config) を正とします。`,
  );
}

main();
