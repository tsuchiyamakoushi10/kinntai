"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * S-C-04 共通エラーページ（500 系）。
 *
 * Next.js App Router の error.tsx は Client Component 必須で、reset
 * で再試行を促す。詳細なスタックは現場には出さない（CLAUDE.md §3.1）。
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // 開発者向けに console には残しておく。本番ログ収集は Phase 2 で。
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-500">問題が発生しました</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">画面を表示できませんでした</h1>
        <p className="mt-3 text-sm text-slate-600">
          少し時間をおいて「再試行」を押してみてください。
          解決しない場合は管理者にお知らせください。
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400">参考: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            再試行
          </button>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
