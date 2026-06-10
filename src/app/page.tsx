import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { APP_TAGLINE } from "@/lib/brand";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50 p-8">
      <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-amber-200/40 blur-3xl" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <BrandLogo size="lg" />
        <p className="mt-2 text-sm text-slate-500">{APP_TAGLINE}</p>
      </div>
      <Link
        href="/login"
        className="relative rounded-full bg-orange-500 px-8 py-3 text-base font-bold text-white shadow-sm shadow-orange-200 transition hover:bg-orange-600"
      >
        ログイン
      </Link>
    </main>
  );
}
