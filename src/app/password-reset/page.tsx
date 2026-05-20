import Link from "next/link";

import { requestPasswordReset } from "./actions";
import { ResetRequestForm } from "./request-form";

export const dynamic = "force-dynamic";

/**
 * S-C-02 パスワード再設定リクエスト。
 *
 * 列挙対策で、登録の有無に関わらず「送信しました」を返す UX。
 */
export default function PasswordResetRequestPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md">
        <h1 className="text-2xl font-bold text-slate-900">パスワード再設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          登録メールアドレスを入力してください。再設定用のリンクを送信します。
        </p>

        <div className="mt-6">
          <ResetRequestForm action={requestPasswordReset} />
        </div>

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="text-slate-600 underline-offset-2 hover:underline">
            ← ログインに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
