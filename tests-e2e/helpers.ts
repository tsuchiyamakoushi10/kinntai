/**
 * E2E スモーク用のヘルパ。
 *
 * 各テストの前後で「テスト対象の打刻データだけ」を削除し、シード由来の
 * マスターデータ (offices / employees / shift_patterns) には触らない。
 * これで dev DB をそのまま使っても他作業を壊さずに繰り返し実行できる。
 */
import { Page, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const TEST_ADMIN = {
  email: "admin@kinntai.local",
  password: "admin0000",
} as const;

export const TEST_EMPLOYEE_E0001 = {
  email: "e0001@kinntai.local",
  password: "kinntai0000",
  employeeCode: "E0001",
  pin: "0001",
} as const;

/** 指定 employeeCode の打刻 / 休憩レコードを全消し。 */
export async function clearAttendanceFor(employeeCode: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true },
  });
  if (!employee) return;
  // 休憩は attendance_records に紐づく onDelete: Cascade なので、親を消すだけで OK
  await prisma.attendanceRecord.deleteMany({ where: { employeeId: employee.id } });
}

/** Playwright テスト終了時に呼ぶ。Prisma の接続を閉じる。 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/** /login のフォームから資格情報を投入する共通フロー。 */
export async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(creds.email);
  await page.getByLabel("パスワード").fill(creds.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  // ログイン後、middleware が role に応じてリダイレクトする。
  // bcrypt cost=12 + コールド起動の dev サーバの組み合わせで初回が遅いので、
  // タイムアウトを長めに取る。
  await expect(page).toHaveURL(/\/(admin|me)/, { timeout: 30_000 });
}

export { prisma };
