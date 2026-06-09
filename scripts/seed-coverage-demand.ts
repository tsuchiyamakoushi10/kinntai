/**
 * 各拠点の配置基準 (office_coverage_demands) を投入する。
 *
 * 値はオーナー提供の実数 (2026-06-08):
 *   デイ      : 月〜土 午前7/午後5 (相談員 午前午後各1)・日祝 休業。夜勤なし
 *   ショート  : 平日/土 午前6/午後6 (相談員各1)・日祝 午前5/午後5。夜入1/夜明1 (毎日)
 *   ナーシング: 全日 午前5/午後5 (相談員各1)。夜入1/夜明1 (毎日)
 *   梨花      : 専用ロジックのため対象外 (参考: 3名/相談員1)
 *
 * upsert なので複数回流しても安全。本番反映はユーザー確認のうえ実施 (CLAUDE.md §5)。
 * 使い方: npx tsx scripts/seed-coverage-demand.ts
 */
import { PrismaClient, type DayKind } from "@prisma/client";

import {
  validateCoverageDemand,
  type CoverageDemandValues,
} from "../src/lib/shift/coverage-demand";

const prisma = new PrismaClient();

type DemandByDayKind = Partial<Record<DayKind, CoverageDemandValues>>;

const z: CoverageDemandValues = {
  amRequired: 0,
  pmRequired: 0,
  counselorAmRequired: 0,
  counselorPmRequired: 0,
  nurseAmRequired: 0,
  nursePmRequired: 0,
  earlyAmRequired: 0,
  nightInRequired: 0,
  nightOutRequired: 0,
};

// 拠点コード → 日種 → 配置基準
const PLAN: Record<string, DemandByDayKind> = {
  "DAY-CENTER": {
    // 午前7のうち送迎(8:15)5名。
    WEEKDAY: {
      ...z,
      amRequired: 7,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      earlyAmRequired: 5,
    },
    SATURDAY: {
      ...z,
      amRequired: 7,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      earlyAmRequired: 5,
    },
    SUNDAY_HOLIDAY: { ...z }, // 日祝 休業
  },
  "SHO-CENTER": {
    WEEKDAY: {
      amRequired: 6,
      pmRequired: 6,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
    SATURDAY: {
      amRequired: 6,
      pmRequired: 6,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
    SUNDAY_HOLIDAY: {
      amRequired: 5,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
  },
  "NRS-CENTER": {
    WEEKDAY: {
      amRequired: 5,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
    SATURDAY: {
      amRequired: 5,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
    SUNDAY_HOLIDAY: {
      amRequired: 5,
      pmRequired: 5,
      counselorAmRequired: 1,
      counselorPmRequired: 1,
      nurseAmRequired: 1,
      nursePmRequired: 1,
      earlyAmRequired: 0,
      nightInRequired: 1,
      nightOutRequired: 1,
    },
  },
};

async function main(): Promise<void> {
  const offices = await prisma.office.findMany({ select: { id: true, code: true, name: true } });
  const byCode = new Map(offices.map((o) => [o.code, o] as const));

  let count = 0;
  for (const [code, byDayKind] of Object.entries(PLAN)) {
    const office = byCode.get(code);
    if (!office) {
      console.warn(`⚠ 拠点コード ${code} が見つかりません。スキップします。`);
      continue;
    }
    for (const [dayKind, values] of Object.entries(byDayKind) as [
      DayKind,
      CoverageDemandValues,
    ][]) {
      const v = validateCoverageDemand(values);
      if (!v.ok) {
        throw new Error(`${code}/${dayKind} の配置基準が不正: ${v.error}`);
      }
      await prisma.officeCoverageDemand.upsert({
        where: { officeId_dayKind: { officeId: office.id, dayKind } },
        update: v.values,
        create: { officeId: office.id, dayKind, ...v.values },
      });
      count++;
    }
    console.log(`✓ ${office.name} (${code}) の配置基準を投入`);
  }
  console.log(`\n✅ ${count} 行を upsert しました。`);
  console.log("※ 梨花は専用ロジックのため対象外。デイの日祝は休業 (全0)。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
