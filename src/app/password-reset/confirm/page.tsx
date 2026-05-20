import Link from "next/link";

import { findValidPasswordResetToken } from "@/lib/password-reset";

import { confirmPasswordReset } from "../actions";
import { ResetConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

/**
 * S-C-03 パスワード再設定確認。
 *
 * クエリ ?token=... を検証し、有効ならフォーム表示。期限切れ / 改ざんは
 * メッセージのみ出して /password-reset に戻す導線を提示する。
 */
export default async function PasswordResetConfirmPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const verified = token ? await findValidPasswordResetToken(token) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md">
        <h1 className="text-2xl font-bold text-slate-900">パスワード再設定</h1>

        {!verified ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">リンクが無効です</p>
            <p>
              有効期限が切れているか、すでに使用済みのリンクです。再度メールから手続きしてください。
            </p>
            <Link
              href="/password-reset"
              className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              再設定リンクを送り直す
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">新しいパスワードを設定してください。</p>
            <div className="mt-6">
              <ResetConfirmForm action={confirmPasswordReset} token={token ?? ""} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
