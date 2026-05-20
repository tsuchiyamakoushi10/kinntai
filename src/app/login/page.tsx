import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user) {
    // 既にログイン済みなら role に応じて自動遷移
    redirect(session.user.role === "ADMIN" ? "/admin" : "/me");
  }

  const { from } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md">
        <h1 className="text-2xl font-bold text-slate-900">kinntai にログイン</h1>
        <p className="mt-1 text-sm text-slate-500">
          メールアドレスとパスワードを入力してください。
        </p>
        <div className="mt-6">
          <LoginForm from={from ?? ""} />
        </div>
        <div className="mt-4 text-center text-sm">
          <Link
            href="/password-reset"
            className="text-slate-600 underline-offset-2 hover:underline"
          >
            パスワードをお忘れの方はこちら
          </Link>
        </div>
      </div>
    </main>
  );
}
