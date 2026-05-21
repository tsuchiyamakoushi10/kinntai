/**
 * S-E-10 従業員のシフト希望入力画面。
 *
 * - スマホ前提のシンプル UI。1 件ずつ追加する。
 * - 同じ日付・種別の重複は DB の unique 制約でエラー表示する。
 * - 一覧には申請中 + 過去 90 日分まで表示し、本人は取り消し可能。
 */
import Link from "next/link";

import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  SHIFT_PREFERENCE_STATUS_LABELS,
  SHIFT_PREFERENCE_TYPE_LABELS,
} from "@/lib/employee-labels";
import { formatDate } from "@/lib/format";

import { createShiftPreference, deleteShiftPreferenceByEmployee } from "./actions";
import { PreferenceForm } from "./preference-form";

export const dynamic = "force-dynamic";

export default async function MyShiftPreferencesPage() {
  const session = await requireSession();
  const employeeId = session.user.employeeId;

  // 90 日前以降の希望を新しい順で表示する
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const preferences = employeeId
    ? await prisma.shiftPreference.findMany({
        where: { employeeId, targetDate: { gte: since } },
        orderBy: { targetDate: "desc" },
      })
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">シフト希望</h1>
        <Link href="/me" className="text-sm text-slate-500 hover:underline">
          ← 戻る
        </Link>
      </header>

      {!employeeId ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          このアカウントには従業員情報が紐づいていないため希望を出せません。
          管理者にお問い合わせください。
        </p>
      ) : (
        <>
          <PreferenceForm action={createShiftPreference} />

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">提出済みの希望</h2>
            {preferences.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">まだ希望はありません。</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {preferences.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="flex flex-col gap-1">
                      <div className="font-medium text-slate-900">
                        {formatDate(p.targetDate)}
                        <span className="ml-2 text-xs text-slate-500">
                          {SHIFT_PREFERENCE_TYPE_LABELS[p.preferenceType]}
                        </span>
                      </div>
                      {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={p.status} />
                      {p.status === "PENDING" && (
                        <form action={deleteShiftPreferenceByEmployee.bind(null, p.id)}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            取り消す
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-slate-500">
            希望は管理者の確認後に確定します。承認状況はこの画面で確認できます。
          </p>
        </>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: keyof typeof SHIFT_PREFERENCE_STATUS_LABELS }) {
  const label = SHIFT_PREFERENCE_STATUS_LABELS[status];
  const tone =
    status === "ACCEPTED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}
