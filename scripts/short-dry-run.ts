/**
 * ショートの自動生成をローカル DB で試す (保存はしない・確認用)。
 *
 * 使い方: npx tsx scripts/short-dry-run.ts [YYYY-MM]   (既定 2026-06)
 */
import { PrismaClient } from "@prisma/client";

import { loadShortGenerateInput } from "../src/lib/shift/short/data";
import { generateShort } from "../src/lib/shift/short/generate";
import { summarizeShortCoverage, toShortProposals } from "../src/lib/shift/short/proposals";

const prisma = new PrismaClient();
const targetMonth = process.argv[2] ?? "2026-06";

async function main(): Promise<void> {
  const office = await prisma.office.findFirst({
    where: { code: "SHO-CENTER" },
    select: { id: true, name: true },
  });
  if (!office) throw new Error("SHO-CENTER が見つかりません");

  const input = await loadShortGenerateInput(prisma, office.id, targetMonth);
  console.log(
    `${office.name} ${targetMonth}: 職員 ${input.employees.length}名 ` +
      `(常勤 ${input.employees.filter((e) => e.isFullTime).length} / ` +
      `相談員 ${input.employees.filter((e) => e.isCounselor).length} / ` +
      `夜勤可 ${input.employees.filter((e) => e.nightCap > 0).length})`,
  );

  const result = generateShort(input);

  console.log("\n日付       種別   午前/午後 (要)   不足       相談員 夜");
  for (const d of result.days) {
    if (!d.coverage) {
      console.log(`${d.date} 休業`);
      continue;
    }
    const c = d.coverage;
    const short =
      c.amShortfall + c.pmShortfall > 0 ? `AM-${c.amShortfall} PM-${c.pmShortfall}` : "—";
    const soudan = `${c.counselorAmShort ? "✗" : "○"}/${c.counselorPmShort ? "✗" : "○"}`;
    const yakin = d.nightFilled ? "○" : "✗";
    console.log(
      `${d.date} ${d.dayKind.padEnd(6)} ${c.presence.am}/${c.presence.pm}` +
        `        ${short.padEnd(12)} ${soudan}   ${yakin}`,
    );
  }

  console.log("\n-- 出勤日数 / 夜勤回数 (職員別) --");
  const empById = new Map(input.employees.map((e) => [e.id, e]));
  const entries = Object.entries(result.workDaysByEmployee).sort((a, b) => {
    const ea = empById.get(a[0])!;
    const eb = empById.get(b[0])!;
    if (ea.isFullTime !== eb.isFullTime) return ea.isFullTime ? -1 : 1;
    return ea.employeeCode.localeCompare(eb.employeeCode);
  });
  for (const [id, n] of entries) {
    const e = empById.get(id)!;
    const nights = result.nightCountByEmployee[id] ?? 0;
    console.log(`  ${e.employeeCode} ${e.isFullTime ? "常勤" : "非常勤"}: ${n}日 (夜勤 ${nights})`);
  }

  // 保存形への変換確認 (記号→shiftPatternId)
  const patterns = await prisma.shiftPattern.findMany({ select: { id: true, name: true } });
  const patternIdByName = new Map(patterns.map((p) => [p.name, p.id]));
  const { proposedShifts, missingSymbols } = toShortProposals(result, patternIdByName);
  const offId = patternIdByName.get("公休");
  const work = proposedShifts.filter((p) => p.shiftPatternId !== offId).length;
  const off = proposedShifts.filter((p) => p.shiftPatternId === offId).length;
  const summary = summarizeShortCoverage(result);

  console.log("\n-- 保存形サマリ --");
  console.log(`  proposedShifts: ${proposedShifts.length} (勤務 ${work} / 公休 ${off})`);
  console.log(`  記号→ID 未解決: ${missingSymbols.length ? missingSymbols.join(",") : "なし"}`);
  console.log(
    `  営業日 ${summary.operatingDays} / 充足 ${summary.filledDays} / ` +
      `不足日 ${summary.amPmShortfallDays.length} / 相談員不足日 ${summary.counselorShortDays.length} / ` +
      `夜勤未充足 ${summary.unfilledNightDays.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
