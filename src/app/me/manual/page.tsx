import Link from "next/link";

import { ManualList } from "@/components/manual-list";

/** S-E-13 使い方 (職員) */
export default function MyManualPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header className="flex items-center gap-3">
        <Link
          href="/me"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          ← 戻る
        </Link>
        <h1 className="text-lg font-bold text-slate-900">使い方</h1>
      </header>
      <p className="text-sm text-slate-600">
        動画の ▶ を押すと、操作のしかたを音声つきで見られます。
      </p>
      <ManualList audiences={["staff"]} />
    </main>
  );
}
