/**
 * S-E-10 従業員のシフト希望入力画面。
 *
 * - スマホ前提。管理側と同じカレンダー操作で、希望休 / 有給 / 夜勤希望を
 *   複数日まとめてタップ → 保存する。提出は PENDING（管理者承認で確定）。
 * - 下に当月の提出状況（承認待ち / 承認済 / 却下）を表示する。
 */
import Link from "next/link";

import { BulkOffCalendar } from "@/components/bulk-off-calendar";
import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  SHIFT_PREFERENCE_STATUS_LABELS,
  SHIFT_PREFERENCE_TYPE_LABELS,
} from "@/lib/employee-labels";
import { formatDate, toDateInputValue } from "@/lib/format";
import { NIGHT_OFFICE_CODES } from "@/lib/shift-preference-bulk";

import { bulkSetMyMonthlyPreferences } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ ym?: string }>;
};

function isValidYm(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export default async function MyShiftPreferencesPage({ searchParams }: Props) {
  const session = await requireSession();
  const employeeId = session.user.employeeId;
  const { ym: ymRaw } = await searchParams;
  const ym = isValidYm(ymRaw) ? ymRaw : currentJstYm();
  const month = monthRange(ym);
  const firstWeekday = month.start.getUTCDay();

  const employee = employeeId
    ? await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          lastName: true,
          firstName: true,
          office: { select: { code: true } },
        },
      })
    : null;

  // 当月のこの社員の 希望休 / 有給 / 夜勤希望（カレンダーの初期マーク + 状況一覧）。
  const monthPrefs = employeeId
    ? await prisma.shiftPreference.findMany({
        where: {
          employeeId,
          targetDate: { gte: month.start, lt: month.end },
          preferenceType: { in: ["REQUESTED_OFF", "PAID_LEAVE", "PREFERRED_NIGHT"] },
        },
        orderBy: { targetDate: "asc" },
      })
    : [];

  const initialMarks = monthPrefs.map((p) => ({
    date: toDateInputValue(p.targetDate),
    type: p.preferenceType as "REQUESTED_OFF" | "PAID_LEAVE" | "PREFERRED_NIGHT",
  }));

  const allowNight = employee?.office?.code != null && NIGHT_OFFICE_CODES.has(employee.office.code);
  const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : "";

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
          {/* 対象月の切替 */}
          <form method="get" className="flex items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">対象月</span>
              <input
                type="month"
                name="ym"
                defaultValue={ym}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              切替
            </button>
          </form>

          <BulkOffCalendar
            action={bulkSetMyMonthlyPreferences}
            employeeId={employeeId}
            employeeName={employeeName}
            ym={ym}
            days={month.days}
            firstWeekday={firstWeekday}
            initialMarks={initialMarks}
            allowNight={allowNight}
          />

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">この月の提出状況</h2>
            {monthPrefs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                まだこの月の希望はありません。上のカレンダーで日付をタップして保存してください。
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {monthPrefs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="font-medium text-slate-900">
                      {formatDate(p.targetDate)}
                      <span className="ml-2 text-xs text-slate-500">
                        {SHIFT_PREFERENCE_TYPE_LABELS[p.preferenceType]}
                      </span>
                    </div>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-slate-500">
            希望は管理者の確認後に確定します。保存し直すと、その月の希望は上書きされ、再度
            「承認待ち」になります。
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
