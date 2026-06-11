"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { prisma } from "@/lib/db";

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
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "");

  if (!identifier || !password) {
    return { error: "IDとパスワードを入力してください。" };
  }

  // Server Action → "/" → middleware で /admin・/me に振り直す経路だと、Next.js
  // 15 + Auth.js v5 の RSC ナビゲーションで URL バーが "/" のまま残るケースがある。
  // ロールが分かれば直接そのホームに飛ばせるので、認証前に role だけ前引きする。
  // パスワードはここでは検証しないので、認証の判定は signIn 側に任せる。
  // loginId / email のどちらでも照合する (authorize と同じ優先順位)。
  const target =
    from ||
    (await (async () => {
      const key = identifier.toLowerCase();
      const user = await prisma.user
        .findFirst({
          where: { OR: [{ loginId: key }, { email: key }] },
          select: { role: true, isActive: true },
        })
        .catch(() => null);
      if (!user || !user.isActive) return "/";
      return user.role === "ADMIN" ? "/admin" : "/me";
    })());

  try {
    await signIn("credentials", {
      identifier,
      password,
      redirectTo: target,
    });
    return {};
  } catch (e) {
    // Auth.js は成功時にも `NEXT_REDIRECT` を throw するため、AuthError 以外は
    // 再 throw して Next.js に処理させる必要がある。
    if (e instanceof AuthError) {
      return { error: "IDまたはパスワードが正しくありません。" };
    }
    throw e;
  }
}
