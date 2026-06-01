"use server";

import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { findValidPasswordResetToken, issuePasswordResetToken } from "@/lib/password-reset";
import { hashPassword } from "@/lib/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResetRequestFormState = {
  error?: string;
  submitted?: boolean;
};

/**
 * S-C-02 リセットリンクを発行してメール送信。
 *
 * 列挙攻撃を避けるため、メールが未登録 / 無効なユーザーでも UI 上は
 * 同じ「送信しました」を返す。実送信は登録済みかつ有効なユーザーにのみ。
 */
export async function requestPasswordReset(
  _prev: ResetRequestFormState,
  formData: FormData,
): Promise<ResetRequestFormState> {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_PATTERN.test(rawEmail)) {
    return { error: "メールアドレスの形式が正しくありません。" };
  }

  const user = await prisma.user.findUnique({
    where: { email: rawEmail },
    select: { id: true, isActive: true },
  });

  if (user && user.isActive) {
    const { rawToken } = await issuePasswordResetToken(user.id);
    const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const link = `${base}/password-reset/confirm?token=${encodeURIComponent(rawToken)}`;
    await sendMail({
      to: rawEmail,
      subject: "[kinntai] パスワード再設定のご案内",
      text: [
        "kinntai のパスワード再設定リクエストを受け付けました。",
        "",
        "以下のリンクを開いて、新しいパスワードを設定してください。",
        "（このリンクは 30 分で無効になります）",
        "",
        link,
        "",
        "心当たりがない場合は、このメールを破棄してください。",
      ].join("\n"),
    });
  }

  return { submitted: true };
}

export type ResetConfirmFormState = {
  error?: string;
  done?: boolean;
};

/**
 * S-C-03 トークン検証 + 新パスワード設定。
 *
 * 既存トークンを再利用させないよう、used_at をパスワード更新と同一
 * トランザクションで立てる。
 */
export async function confirmPasswordReset(
  _prev: ResetConfirmFormState,
  formData: FormData,
): Promise<ResetConfirmFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "新しいパスワードは 8 文字以上にしてください。" };
  }
  if (password.trim().length !== password.length) {
    return { error: "新しいパスワードの先頭・末尾に空白は使えません。" };
  }
  if (password !== confirm) {
    return { error: "確認のパスワードが一致しません。" };
  }

  const verified = await findValidPasswordResetToken(token);
  if (!verified) {
    return { error: "リンクが無効か、期限が切れています。再度メールから手続きしてください。" };
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: verified.userId },
      // 本人が新パスワードを設定したので初期パスワード強制変更フラグを下ろす。
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.passwordResetToken.update({
      where: { id: verified.id },
      data: { usedAt: new Date() },
    });
  });

  return { done: true };
}
