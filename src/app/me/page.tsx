import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { todayJstDate } from "@/lib/attendance/business-date";
import { findRelevantAttendance } from "@/lib/attendance/lookup";
import {
  ACTION_LABELS,
  STATE_LABELS,
  allowedActions,
  deriveState,
  type PunchAction,
} from "@/lib/attendance/punch";
import { ATTENDANCE_ENABLED } from "@/lib/feature-flags";

import { punch } from "./actions";

export const dynamic = "force-dynamic";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

type PageProps = {
  searchParams: Promise<{ err?: string }>;
};

export default async function MyHomePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = session.user.name ?? "従業員";
  const employeeId = session.user.employeeId;
  const { err } = await searchParams;

  // 打刻封印中は勤怠データを取得せず、状態表示・打刻ボタンも出さない。
  const todayDate = todayJstDate();
  const attendance =
    ATTENDANCE_ENABLED && employeeId ? await findRelevantAttendance(employeeId, todayDate) : null;
  const state = deriveState(attendance, attendance?.breakRecords ?? []);
  const actions = ATTENDANCE_ENABLED ? allowedActions(state) : [];
  const openBreakStart =
    attendance?.breakRecords.find((b) => b.breakEndAt === null)?.breakStartAt ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">{name} さん</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ログアウト
          </button>
        </form>
      </header>

      {ATTENDANCE_ENABLED && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">いまの状態</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {STATE_LABELS[state]}
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
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
      )}

      {err && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {err}
        </p>
      )}

      {ATTENDANCE_ENABLED &&
        (!employeeId ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
            このアカウントには従業員情報が紐づいていません。管理者にお問い合わせください。
          </p>
        ) : actions.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-700 shadow-sm">
            今日の出退勤は完了しています。修正は管理者へ連絡してください。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {actions.map((a) => (
              <PunchButton key={a} action={a} />
            ))}
          </div>
        ))}

      <nav className="mt-2 grid grid-cols-1 gap-2">
        {ATTENDANCE_ENABLED && (
          <Link
            href="/me/attendance"
            className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            <span>今月の勤怠を見る</span>
            <span aria-hidden className="text-slate-400">
              →
            </span>
          </Link>
        )}
        <Link
          href="/me/shifts"
          className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <span>今月のシフトを見る</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
        </Link>
        <Link
          href="/me/leave"
          className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <span>有給残数を見る</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
        </Link>
        <Link
          href="/me/shift-preferences"
          className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <span>シフト希望を出す</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
        </Link>
        <Link
          href="/me/profile"
          className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <span>プロフィール・パスワード変更</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
        </Link>
      </nav>
    </main>
  );
}

function PunchButton({ action }: { action: PunchAction }) {
  return (
    <form action={punch}>
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={`w-full rounded-2xl py-7 text-2xl font-bold text-white shadow-md transition active:scale-[0.98] ${ACTION_STYLES[action]}`}
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
