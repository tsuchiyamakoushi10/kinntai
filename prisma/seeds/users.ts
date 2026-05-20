/**
 * ログインアカウント（User）を投入する。
 *
 * - 管理者 1 名: admin@kinntai.local / admin0000
 * - 従業員 55 名: e0001..e0055@kinntai.local / kinntai0000
 *
 * 開発環境専用のパスワード。bcrypt のハッシュ化は重い（cost=12 × 56 件で
 * 数秒）ので、既にレコードがある場合はハッシュを再生成せず、ロール・
 * リンクのみ更新する形でべき等性を保つ。
 *
 * 共有タブレット打刻用の暗証番号 (PIN) は、employeeCode の下 4 桁
 * （例: E0001 → 0001）を初期値として全員に付与する。本番ではログイン後に
 * 管理者が個別に上書きする想定。既に PIN ハッシュがあるユーザーは触らない
 * （現場でデバッグ済みの PIN を上書きしないため）。
 *
 * docs/requirements.md §5: パスワードは bcrypt ハッシュ。
 */
import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../../src/lib/password";
import { hashPin } from "../../src/lib/pin";

const ADMIN_EMAIL = "admin@kinntai.local";
const ADMIN_PASSWORD = "admin0000";
const EMPLOYEE_PASSWORD = "kinntai0000";

async function ensureUser(
  prisma: PrismaClient,
  args: {
    email: string;
    role: UserRole;
    employeeId: string | null;
    password: string;
  },
): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: args.email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: args.role,
        employeeId: args.employeeId,
        isActive: true,
      },
    });
    return;
  }
  const passwordHash = await hashPassword(args.password);
  await prisma.user.create({
    data: {
      email: args.email,
      passwordHash,
      role: args.role,
      employeeId: args.employeeId,
      isActive: true,
    },
  });
}

/**
 * employeeCode から初期 PIN を導く。E0001 → "0001" のような下 4 桁。
 * 4 桁にならないコードは（現状あり得ないが）下 4 桁ゼロ埋めで丸める。
 */
function initialPinFromEmployeeCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail.padStart(4, "0");
}

async function ensureEmployeePin(prisma: PrismaClient, userId: string, pin: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinCodeHash: true },
  });
  if (user?.pinCodeHash) return; // 既存ハッシュは上書きしない
  const pinCodeHash = await hashPin(pin);
  await prisma.user.update({
    where: { id: userId },
    data: { pinCodeHash },
  });
}

export async function seedUsers(
  prisma: PrismaClient,
): Promise<{ admin: number; employee: number }> {
  // 管理者
  await ensureUser(prisma, {
    email: ADMIN_EMAIL,
    role: "ADMIN",
    employeeId: null,
    password: ADMIN_PASSWORD,
  });

  // 従業員 55 名分。employees seed が先に走っていることを前提。
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true },
    orderBy: { employeeCode: "asc" },
  });

  for (const e of employees) {
    await ensureUser(prisma, {
      email: `${e.employeeCode.toLowerCase()}@kinntai.local`,
      role: "EMPLOYEE",
      employeeId: e.id,
      password: EMPLOYEE_PASSWORD,
    });
  }

  // PIN を付与する（既にあれば skip）。User を一度引き直す。
  const users = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, employee: { select: { employeeCode: true } } },
  });
  for (const u of users) {
    const code = u.employee?.employeeCode;
    if (!code) continue;
    await ensureEmployeePin(prisma, u.id, initialPinFromEmployeeCode(code));
  }

  return { admin: 1, employee: employees.length };
}

export const DEV_CREDENTIALS = {
  admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  // 従業員は employeeCode から派生（例: E0001 → e0001@kinntai.local）
  employeePassword: EMPLOYEE_PASSWORD,
  // 共有タブレット打刻用の初期 PIN は employeeCode の下 4 桁（例: E0001 → 0001）
  employeePinHint: "employeeCode の下 4 桁（例 E0001 → 0001）",
};
