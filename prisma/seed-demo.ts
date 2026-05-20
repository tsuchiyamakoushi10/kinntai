/**
 * 1 か月運用シミュレーション用のデモデータ投入エントリ。
 *
 * 通常の `pnpm db:seed` (= prisma/seed.ts) はマスターのみを投入する。
 * 本スクリプトは現在月のシフト・打刻・有給付与を生成し、ダッシュボードや
 * 月別集計・有給管理画面に「動いている事業所」相当のデータを乗せる。
 *
 * 実行: `pnpm db:seed:demo`
 *   - 引数なし: 当月 (JST) を対象
 *   - `pnpm db:seed:demo 2026-04` のように YYYY-MM を渡すと指定月を対象
 *
 * 何度流しても重複しないが、本番 DB には流さないこと。
 */
import { PrismaClient } from "@prisma/client";

import { seedDemoMonth } from "./seeds/demo-month";

async function main(): Promise<void> {
  const ymArg = process.argv[2];
  if (ymArg && !/^\d{4}-(0[1-9]|1[0-2])$/.test(ymArg)) {
    console.error(`invalid YYYY-MM: ${ymArg}`);
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    console.log(`seeding demo month: ${ymArg ?? "(current)"}`);
    const stats = await seedDemoMonth(prisma, ymArg);
    console.log("done.", stats);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
