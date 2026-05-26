/**
 * 本番初回投入シード。
 *
 * 投入するもの:
 *   - 5 拠点 (master.ts)
 *   - シフトパターンマスター (master.ts)
 *   - 会社情報雛形 (company-profile.ts: 既に行があれば触らない)
 *   - 管理者 1 名 (環境変数 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
 *
 * 投入しないもの:
 *   - 従業員 (UI から入力する)
 *   - 拠点シフト枠 quota (S-A-27 から入力)
 *   - 開発用従業員ユーザー
 *   - デモシフト / 打刻
 *
 * すべて upsert / 既存なら skip でべき等。
 * 実行: `pnpm db:seed:prod`
 */
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/password";
import { seedCompanyProfile } from "./seeds/company-profile";
import { seedOffices, seedShiftPatterns, PATTERNS } from "./seeds/master";

const prisma = new PrismaClient();

async function ensureAdminUser(args: {
  email: string;
  password: string;
}): Promise<"created" | "exists"> {
  const existing = await prisma.user.findUnique({ where: { email: args.email } });
  if (existing) {
    if (existing.role !== "ADMIN" || !existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", isActive: true },
      });
    }
    return "exists";
  }
  const passwordHash = await hashPassword(args.password);
  await prisma.user.create({
    data: {
      email: args.email,
      passwordHash,
      role: "ADMIN",
      employeeId: null,
      isActive: true,
    },
  });
  return "created";
}

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD が未設定です。本番では Vercel の Environment Variables に登録してから実行してください。",
    );
  }
  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD は 10 文字以上にしてください。");
  }

  console.log("seeding offices...");
  const officeIds = await seedOffices(prisma);
  console.log(`  ${officeIds.size} offices upserted`);

  console.log("seeding shift patterns...");
  await seedShiftPatterns(prisma, officeIds);
  console.log(`  ${PATTERNS.length} patterns upserted`);

  console.log("seeding company profile...");
  const inserted = await seedCompanyProfile(prisma);
  console.log(`  company_profile ${inserted ? "created" : "already exists (skipped)"}`);

  console.log(`ensuring admin user (${email})...`);
  const adminResult = await ensureAdminUser({ email, password });
  console.log(`  admin user ${adminResult}`);

  const counts = {
    offices: await prisma.office.count(),
    shiftPatterns: await prisma.shiftPattern.count(),
    employees: await prisma.employee.count(),
    users: await prisma.user.count(),
    companyProfile: await prisma.companyProfile.count(),
  };
  console.log("done.", counts);
  console.log("");
  console.log("初回ログイン情報:");
  console.log(`  email: ${email}`);
  console.log("  password: (環境変数 SEED_ADMIN_PASSWORD)");
  console.log("ログイン後、必ず S-A-28 から会社情報を確認し、管理者パスワードを変更してください。");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
