import Link from "next/link";

export function MissingCompany() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold text-slate-900">労働条件通知書</h1>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        会社情報が未登録です。先に{" "}
        <Link href="/admin/company-profile" className="font-semibold underline">
          設定 → 会社情報
        </Link>{" "}
        を登録してください。
      </p>
    </div>
  );
}
