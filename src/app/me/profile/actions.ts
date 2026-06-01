"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const PHONE_PATTERN = /^[0-9+\-()\s]{0,20}$/;

export type PasswordFormState = {
  error?: string;
  message?: string;
};

/**
 * 現パスワードを検証してから新パスワードを保存する。
 * 8 文字以上、英数記号は問わないが空白だけは拒否。
 */
export async function changeMyPassword(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const session = await requireSession();
  const userId = session.user.id;

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current) return { error: "現在のパスワードを入力してください。" };
  if (next.length < 8) return { error: "新しいパスワードは 8 文字以上にしてください。" };
  if (next.trim().length !== next.length) {
    return { error: "新しいパスワードの先頭・末尾に空白は使えません。" };
  }
  if (next !== confirm) return { error: "確認のパスワードが一致しません。" };
  if (next === current) {
    return { error: "現在のパスワードと違うものを設定してください。" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return { error: "アカウントが無効です。管理者へ連絡してください。" };
  }

  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) return { error: "現在のパスワードが違います。" };

  const newHash = await hashPassword(next);
  await prisma.user.update({
    where: { id: userId },
    // 本人が新パスワードを設定したので初期パスワード強制変更フラグを下ろす。
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  return { message: "パスワードを変更しました。" };
}

export type ContactFormState = {
  error?: string;
  message?: string;
  values?: { phone: string };
};

/** 電話番号を更新する。他の人事情報は管理者経由で変更してもらう。 */
export async function updateMyContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const session = await requireSession();
  const employeeId = session.user.employeeId;
  if (!employeeId) {
    return { error: "従業員情報が紐づいていません。管理者へ連絡してください。" };
  }

  const phone = String(formData.get("phone") ?? "").trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    return {
      error: "電話番号は数字とハイフン等で 20 文字以内で入力してください。",
      values: { phone },
    };
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { phone: phone || null },
  });

  revalidatePath("/me/profile");
  return { message: "連絡先を更新しました。", values: { phone } };
}
