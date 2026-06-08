/**
 * デイの自動生成をローカル DB で試す (保存はしない・確認用)。
 *
 * 使い方: npx tsx scripts/dey-dry-run.ts [YYYY-MM]   (既定 2026-06)
 */
import { PrismaClient } from "@prisma/client";

import { loadDeyGenerateInput } from "../src/lib/shift/dey/data";
import { generateDey } from "../src/lib/shift/dey/generate";
import { summarizeDeyCoverage, toDeyProposals } from "../src/lib/shift/dey/proposals";

const prisma = new PrismaClient();
const targetMonth = process.argv[2] ?? "2026-06";

async function main(): Promise<void> {
  const office = await prisma.office.findFirst({
    where: { code: "DAY-CENTER" },
    select: { id: true, name: true },
  });
  if (!office) throw new Error("DAY-CENTER が見つかりません");

  const input = await loadDeyGenerateInput(prisma, office.id, targetMonth);
  console.log(
    `${office.name} ${targetMonth}: 職員 ${input.employees.length}名 ` +
      `(常勤 ${input.employees.filter((e) => e.isFullTime).length} / ` +
      `相談員 ${input.employees.filter((e) => e.isCounselor).length})`,
  );

  const result = generateDey(input);

  console.log("\n日付       種別   午前/午後 (要)   不足   相談員");
  for (const d of result.days) {
    if (!d.coverage) {
      console.log(`${d.date} 休業`);
      continue;
    }
    const c = d.coverage;
    const short =
      c.amShortfall + c.pmShortfall > 0 ? `AM-${c.amShortfall} PM-${c.pmShortfall}` : "—";
    const soudan = `${c.counselorAmShort ? "✗" : "○"}/${c.counselorPmShort ? "✗" : "○"}`;
    console.log(
      `${d.date} ${d.dayKind.padEnd(6)} ${c.presence.am}/${c.presence.pm}` +
        `        ${short.padEnd(10)} ${soudan}`,
    );
  }

  console.log("\n-- 出勤日数 (職員別) --");
  const empById = new Map(input.employees.map((e) => [e.id, e]));
  const entries = Object.entries(result.workDaysByEmployee).sort((a, b) => {
    const ea = empById.get(a[0])!;
    const eb = empById.get(b[0])!;
    if (ea.isFullTime !== eb.isFullTime) return ea.isFullTime ? -1 : 1;
    return ea.employeeCode.localeCompare(eb.employeeCode);
  });
  for (const [id, n] of entries) {
    const e = empById.get(id)!;
    console.log(`  ${e.employeeCode} ${e.isFullTime ? "常勤" : "非常勤"}: ${n}日`);
  }

  // 保存形への変換確認 (記号→shiftPatternId)
  const patterns = await prisma.shiftPattern.findMany({ select: { id: true, name: true } });
  const patternIdByName = new Map(patterns.map((p) => [p.name, p.id]));
  const { proposedShifts, missingSymbols } = toDeyProposals(result, patternIdByName);
  const offId = patternIdByName.get("公休");
  const work = proposedShifts.filter((p) => p.shiftPatternId !== offId).length;
  const off = proposedShifts.filter((p) => p.shiftPatternId === offId).length;
  const summary = summarizeDeyCoverage(result);

  console.log("\n-- 保存形サマリ --");
  console.log(`  proposedShifts: ${proposedShifts.length} (勤務 ${work} / 公休 ${off})`);
  console.log(`  記号→ID 未解決: ${missingSymbols.length ? missingSymbols.join(",") : "なし"}`);
  console.log(
    `  営業日 ${summary.operatingDays} / 充足 ${summary.filledDays} / ` +
      `不足日 ${summary.amPmShortfallDays.length} / 相談員不足日 ${summary.counselorShortDays.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
