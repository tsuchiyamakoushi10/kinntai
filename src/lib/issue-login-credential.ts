/**
 * 職員のログイン資格情報 (loginId + 初期パスワード) を発行 / 再発行する中核処理。
 *
 * 一括発行ページと社員詳細の個別再発行の双方から呼ぶため、Server Action 層
 * (`"use server"`) ではなくここに DB 操作をまとめる。返り値の `initialPassword`
 * は平文だが DB には保存しない（呼び出し側が一度だけ画面表示する運用）。
 */
import { prisma } from "@/lib/db";
import {
  generateInitialPassword,
  loginIdFromEmployeeCode,
  resolveUniqueLoginId,
} from "@/lib/login-credentials";
import { hashPassword } from "@/lib/password";

export type IssuedCredential = {
  employeeId: string;
  name: string;
  loginId: string;
  /** 平文の初期パスワード。発行直後に一度だけ表示する用途のみ。 */
  initialPassword: string;
};

/**
 * 1 名分のログイン資格情報を発行する。
 *
 * - 既存アカウントが無ければ作成、あれば更新（パスワードを必ず再生成）。
 * - loginId は既存があれば維持（配布済みのため安定させる）、無ければ従業員コード
 *   由来の base から一意な値を決める。
 * - `reservedLoginIds` で同一バッチ内の衝突も避ける（一括発行用）。
 */
export async function issueCredentialForEmployee(
  employeeId: string,
  reservedLoginIds: Set<string> = new Set(),
): Promise<IssuedCredential> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeCode: true,
      lastName: true,
      firstName: true,
      user: { select: { id: true, loginId: true } },
    },
  });
  if (!employee) {
    throw new Error(`従業員が見つかりません: ${employeeId}`);
  }

  let loginId = employee.user?.loginId ?? null;
  if (!loginId) {
    const base = loginIdFromEmployeeCode(employee.employeeCode);
    loginId = await resolveUniqueLoginId(base, async (candidate) => {
      if (reservedLoginIds.has(candidate)) return true;
      const hit = await prisma.user.findUnique({
        where: { loginId: candidate },
        select: { id: true },
      });
      return hit !== null;
    });
  }
  reservedLoginIds.add(loginId);

  const initialPassword = generateInitialPassword();
  const passwordHash = await hashPassword(initialPassword);

  if (employee.user) {
    await prisma.user.update({
      where: { id: employee.user.id },
      data: { loginId, passwordHash, mustChangePassword: true, isActive: true },
    });
  } else {
    await prisma.user.create({
      data: {
        loginId,
        passwordHash,
        role: "EMPLOYEE",
        employeeId: employee.id,
        mustChangePassword: true,
      },
    });
  }

  return {
    employeeId: employee.id,
    name: `${employee.lastName} ${employee.firstName}`,
    loginId,
    initialPassword,
  };
}
