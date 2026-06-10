import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandLogo } from "@/components/brand-logo";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-pink-50 via-white to-rose-50 p-4">
      {/* やわらかい装飾 (ピンクの光のにじみ)。 */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-pink-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-rose-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-3xl border border-white/70 bg-white/90 p-8 shadow-xl shadow-pink-100/60 backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <p className="mt-5 text-sm text-slate-500">
            メールアドレスとパスワードを入力してください。
          </p>
        </div>
        <div className="mt-6">
          <LoginForm from={from ?? ""} />
        </div>
        <div className="mt-5 text-center text-sm">
          <Link
            href="/password-reset"
            className="text-slate-500 underline-offset-2 transition-colors hover:text-pink-600 hover:underline"
          >
            パスワードをお忘れの方はこちら
          </Link>
        </div>
      </div>
    </main>
  );
}
