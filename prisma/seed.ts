/**
 * 開発用シード。
 *
 * - 5 拠点 + 約 30 種のシフトパターン (master.ts)
 * - 架空の従業員 55 名
 * - 開発用ログイン (管理者 / 全従業員)
 * - 拠点シフト枠 / 会社情報の雛形
 *
 * 本番初回投入は `prisma/seed-prod.ts` を使うこと
 * (架空従業員などのテストデータを入れない)。
 *
 * 実行: `pnpm db:seed`
 */
import { PrismaClient } from "@prisma/client";
import { seedCompanyProfile } from "./seeds/company-profile";
import { seedEmployees } from "./seeds/employees";
import { seedOffices, seedShiftPatterns, PATTERNS } from "./seeds/master";
import { seedOfficeShiftQuotas } from "./seeds/quotas";
import { seedUsers, DEV_CREDENTIALS } from "./seeds/users";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("seeding offices...");
  const officeIds = await seedOffices(prisma);
  console.log(`  ${officeIds.size} offices upserted`);

  console.log("seeding shift patterns...");
  await seedShiftPatterns(prisma, officeIds);
  console.log(`  ${PATTERNS.length} patterns upserted`);

  console.log("seeding employees...");
  const employeeCount = await seedEmployees(prisma, officeIds);
  console.log(`  ${employeeCount} employees upserted`);

  console.log("seeding users...");
  const users = await seedUsers(prisma);
  console.log(`  ${users.admin} admin + ${users.employee} employee users ready`);

  console.log("seeding office shift quotas...");
  const quotaCount = await seedOfficeShiftQuotas(prisma, officeIds);
  console.log(`  ${quotaCount} office_shift_quotas upserted`);

  console.log("seeding company profile...");
  const inserted = await seedCompanyProfile(prisma);
  console.log(`  company_profile ${inserted ? "created" : "already exists (skipped)"}`);

  const counts = {
    offices: await prisma.office.count(),
    shiftPatterns: await prisma.shiftPattern.count(),
    employees: await prisma.employee.count(),
    users: await prisma.user.count(),
    officeShiftQuotas: await prisma.officeShiftQuota.count(),
    companyProfile: await prisma.companyProfile.count(),
  };
  console.log("done.", counts);
  console.log("");
  console.log("  ── dev login (開発専用 / 本番投入禁止) ──");
  console.log(`  admin   : ${DEV_CREDENTIALS.admin.email} / ${DEV_CREDENTIALS.admin.password}`);
  console.log(`  employee: e0001..e0055@kinntai.local / ${DEV_CREDENTIALS.employeePassword}`);
  console.log(`  tablet PIN: ${DEV_CREDENTIALS.employeePinHint}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
