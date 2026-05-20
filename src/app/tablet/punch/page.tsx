import Link from "next/link";
import { redirect } from "next/navigation";

import { todayJstDate } from "@/lib/attendance/business-date";
import { findRelevantAttendance } from "@/lib/attendance/lookup";
import {
  ACTION_LABELS,
  STATE_LABELS,
  allowedActions,
  deriveState,
  type PunchAction,
} from "@/lib/attendance/punch";
import { prisma } from "@/lib/db";
import { getTabletOfficeId, getTabletPinEmployeeId } from "@/lib/tablet/session";

import { punchFromTablet } from "./actions";

type PageProps = {
  searchParams: Promise<{ err?: string }>;
};

/**
 * S-T-04 打刻メニュー。
 *
 * 直前の S-T-03 で発行された短期 PIN cookie を持っているはず。期限切れなら
 * 名前選択 (S-T-02) に戻して入力をやり直してもらう。
 *
 * ボタンは現在状態に応じて「次にできる打刻」だけ表示。誤タップを避ける。
 */
export default async function TabletPunchPage({ searchParams }: PageProps) {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const employeeId = await getTabletPinEmployeeId();
  if (!employeeId) redirect("/tablet");

  const { err } = await searchParams;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, lastName: true, firstName: true },
  });
  if (!employee) redirect("/tablet");

  const today = todayJstDate();
  const attendance = await findRelevantAttendance(employee.id, today);
  const state = deriveState(attendance, attendance?.breakRecords ?? []);
  const actions = allowedActions(state);
  const openBreakStart =
    attendance?.breakRecords.find((b) => b.breakEndAt === null)?.breakStartAt ?? null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <Link href="/tablet" className="text-sm text-slate-600 hover:text-slate-900">
          <span aria-hidden>←</span> 名前を選び直す
        </Link>
        <p className="text-xs text-slate-500">30 秒以内に打刻してください</p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wider text-slate-500">本人確認 OK</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {employee.lastName} {employee.firstName} さん
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
          <dt className="text-slate-500">いまの状態</dt>
          <dd className="text-right font-semibold text-slate-900">{STATE_LABELS[state]}</dd>
          <dt className="text-slate-500">出勤</dt>
          <dd className="text-right text-slate-900 tabular-nums">
            {formatJstHm(attendance?.clockInAt)}
          </dd>
          {openBreakStart && (
            <>
              <dt className="text-slate-500">休憩開始</dt>
              <dd className="text-right text-slate-900 tabular-nums">
                {formatJstHm(openBreakStart)}
              </dd>
            </>
          )}
          <dt className="text-slate-500">退勤</dt>
          <dd className="text-right text-slate-900 tabular-nums">
            {formatJstHm(attendance?.clockOutAt)}
          </dd>
        </dl>
      </section>

      {err && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {err}
        </p>
      )}

      {actions.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-700 shadow-sm">
          今日の出退勤は完了しています。修正は管理者へ連絡してください。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <PunchButton key={a} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function PunchButton({ action }: { action: PunchAction }) {
  return (
    <form action={punchFromTablet}>
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={`w-full rounded-2xl py-10 text-3xl font-bold text-white shadow-md transition active:scale-[0.98] ${ACTION_STYLES[action]}`}
      >
        {ACTION_LABELS[action]}
      </button>
    </form>
  );
}

const ACTION_STYLES: Record<PunchAction, string> = {
  CLOCK_IN: "bg-blue-600 hover:bg-blue-700",
  CLOCK_OUT: "bg-slate-700 hover:bg-slate-800",
  BREAK_START: "bg-amber-500 hover:bg-amber-600",
  BREAK_END: "bg-emerald-600 hover:bg-emerald-700",
};

const HM_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatJstHm(d: Date | null | undefined): string {
  if (!d) return "—";
  return HM_FORMATTER.format(d);
}
