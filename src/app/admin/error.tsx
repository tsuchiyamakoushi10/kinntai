"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 管理画面スコープのエラー境界。
 *
 * グローバル error.tsx だと管理画面のヘッダー / サイドバーが消えて
 * 「迷子」になるため、admin 配下ではこちらが先に拾い、リンクは
 * 管理ホームに向ける。
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white p-10 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-500">問題が発生しました</p>
      <h1 className="text-xl font-bold text-slate-900">画面を表示できませんでした</h1>
      <p className="max-w-md text-sm text-slate-600">
        少し時間をおいて「再試行」を押してみてください。 解決しない場合は管理者にお知らせください。
      </p>
      {error.digest && <p className="font-mono text-xs text-slate-400">参考: {error.digest}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          再試行
        </button>
        <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          管理ホームに戻る
        </Link>
      </div>
    </div>
  );
}
