/**
 * 勤務記号マスター_確定.csv の午前/午後カウントを ShiftPattern (DB) に反映する。
 *
 * 設計書 原則4: CSV を唯一の正とする。本スクリプトは CSV を読み、ShiftPattern を
 * name (= CSV の基本記号) で名寄せして am_count / pm_count を更新する。
 * 突き合わせ結果 (マッチ / DB側未マッチ / CSV側未マッチ) を出力する。
 *
 * 使い方: npx tsx scripts/sync-coverage.ts            (適用)
 *         npx tsx scripts/sync-coverage.ts --dry-run  (差分表示のみ)
 *
 * docs/auto-shift-design-v2.md (案A)。本番反映はユーザー確認のうえ実施する (CLAUDE.md §5)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { parseSymbolMaster } from "../src/lib/shift/coverage";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = join(process.cwd(), "勤務記号マスター_確定.csv");

// 在席カウントの評価対象外 (CSV に載っていなくても警告しない記号区分)。
// 休 (公休/有休) や厨房/その他は am/pm=0 で運用するため未マッチでも問題ない。
const NON_COVERAGE_KINDS = new Set(["OFF", "PAID_LEAVE", "ABSENCE", "REQUESTED_OFF"]);

async function main(): Promise<void> {
  const master = parseSymbolMaster(readFileSync(CSV_PATH, "utf8"));

  const patterns = await prisma.shiftPattern.findMany({
    select: { id: true, code: true, name: true, shiftKind: true, amCount: true, pmCount: true },
    orderBy: [{ officeId: "asc" }, { sortOrder: "asc" }],
  });

  const matchedNames = new Set<string>();
  const updates: { id: string; name: string; from: string; to: string }[] = [];
  const dbUnmatched: string[] = [];

  for (const p of patterns) {
    const cov = master.get(p.name);
    if (!cov) {
      // CSV に無い DB パターン。休系は想定内なので報告から除く。
      if (!NON_COVERAGE_KINDS.has(p.shiftKind)) {
        dbUnmatched.push(`${p.code} (${p.name}) [${p.shiftKind}]`);
      }
      continue;
    }
    matchedNames.add(p.name);
    if (p.amCount !== cov.amCount || p.pmCount !== cov.pmCount) {
      updates.push({
        id: p.id,
        name: p.name,
        from: `am=${p.amCount},pm=${p.pmCount}`,
        to: `am=${cov.amCount},pm=${cov.pmCount}`,
      });
    }
  }

  const csvUnmatched = [...master.keys()].filter((name) => !matchedNames.has(name));

  console.log(`勤務記号マスター: ${master.size} 記号 / DB ShiftPattern: ${patterns.length} 件`);
  console.log(`名寄せ成功: ${matchedNames.size} / 更新が必要: ${updates.length} 件`);

  if (updates.length > 0) {
    console.log("\n-- 更新内容 --");
    for (const u of updates) console.log(`  ${u.name}: ${u.from} -> ${u.to}`);
  }
  if (dbUnmatched.length > 0) {
    console.log("\n⚠ CSV に無い DB パターン (要確認):");
    for (const d of dbUnmatched) console.log(`  ${d}`);
  }
  if (csvUnmatched.length > 0) {
    console.log("\nℹ DB に無い CSV 記号 (配置基準外なら問題なし):");
    for (const c of csvUnmatched) console.log(`  ${c}`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] 適用していません。");
    return;
  }
  if (updates.length === 0) {
    console.log("\n更新はありません。");
    return;
  }

  await prisma.$transaction(
    updates.map((u) => {
      const cov = master.get(u.name)!;
      return prisma.shiftPattern.update({
        where: { id: u.id },
        data: { amCount: cov.amCount, pmCount: cov.pmCount },
      });
    }),
  );
  console.log(`\n✅ ${updates.length} 件を更新しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
