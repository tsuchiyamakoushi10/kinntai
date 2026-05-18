"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

/**
 * S-C-01 ログイン画面の Server Action。
 *
 * - 成功時は Auth.js 側で `redirectTo` に応じてリダイレクトが投げられる
 *   （Next.js の Server Action は redirect の例外を throw し直すこと）。
 * - 失敗時は state.error にユーザー向けメッセージを返す。専門用語を避ける。
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      // redirectTo を空にすると / に飛ぶ → middleware が role 別に振り分ける。
      redirectTo: from || "/",
    });
    return {};
  } catch (e) {
    // Auth.js は成功時にも `NEXT_REDIRECT` を throw するため、AuthError 以外は
    // 再 throw して Next.js に処理させる必要がある。
    if (e instanceof AuthError) {
      return { error: "メールアドレスまたはパスワードが正しくありません。" };
    }
    throw e;
  }
}
