import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-500">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">ページが見つかりません</h1>
        <p className="mt-3 text-sm text-slate-600">
          URL が間違っているか、削除された情報を開こうとしている可能性があります。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ホームに戻る
        </Link>
      </div>
    </main>
  );
}
