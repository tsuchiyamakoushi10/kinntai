import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatMinutes, summarize } from "@/lib/attendance/aggregate";
import { fromJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ date: string }>;
};

const YMD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const HMS = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const FULL_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

function formatHms(d: Date | null | undefined): string {
  if (!d) return "—";
  return HMS.format(d);
}

function diffMin(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

export default async function AttendanceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;
  if (!employeeId) redirect("/me");

  const { date } = await params;
  if (!YMD_PATTERN.test(date)) notFound();

  const workDate = fromJstYmd(date);
  const ym = date.slice(0, 7);

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { breakRecords: { orderBy: { breakStartAt: "asc" } } },
  });

  const dateLabel = FULL_DATE.format(fromJstYmd(date));

  if (!record) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
        <BackLink ym={ym} />
        <h1 className="text-xl font-bold text-slate-900">{dateLabel}</h1>
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          この日の打刻はありません。
        </p>
      </main>
    );
  }

  const summary = summarize({
    clockInAt: record.clockInAt,
    clockOutAt: record.clockOutAt,
    breakRecords: record.breakRecords,
  });

  const isOngoing = record.clockInAt !== null && record.clockOutAt === null;
  const isCrossingMidnight =
    record.clockInAt &&
    record.clockOutAt &&
    toJstYmd(record.clockInAt) !== toJstYmd(record.clockOutAt);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
      <BackLink ym={ym} />

      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-slate-900">{dateLabel}</h1>
        {isOngoing && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            勤務中
          </span>
        )}
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xs font-medium text-slate-500">出退勤</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-500">出勤</dt>
          <dd className="text-right text-slate-900 tabular-nums">{formatHms(record.clockInAt)}</dd>
          <dt className="text-slate-500">
            退勤
            {isCrossingMidnight && <span className="ml-1 text-xs text-slate-500">(翌日)</span>}
          </dt>
          <dd className="text-right text-slate-900 tabular-nums">{formatHms(record.clockOutAt)}</dd>
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xs font-medium text-slate-500">休憩</h2>
        {record.breakRecords.length === 0 ? (
          <p className="mt-2 text-sm text-slate-700">休憩の記録はありません。</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {record.breakRecords.map((b) => {
              const min = b.breakEndAt ? diffMin(b.breakStartAt, b.breakEndAt) : null;
              return (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-700 tabular-nums">
                    {formatHms(b.breakStartAt)} 〜 {formatHms(b.breakEndAt)}
                  </span>
                  <span className="text-slate-900 tabular-nums">
                    {min !== null ? `${formatMinutes(min)}` : "進行中"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xs font-medium text-slate-500">集計</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-500">拘束時間</dt>
          <dd className="text-right text-slate-900 tabular-nums">
            {summary.spanMinutes > 0 ? formatMinutes(summary.spanMinutes) : "—"}
          </dd>
          <dt className="text-slate-500">休憩計</dt>
          <dd className="text-right text-slate-900 tabular-nums">
            {summary.breakMinutes > 0 ? formatMinutes(summary.breakMinutes) : "—"}
          </dd>
          <dt className="font-medium text-slate-900">実労働</dt>
          <dd className="text-right font-bold text-slate-900 tabular-nums">
            {summary.workMinutes > 0 ? formatMinutes(summary.workMinutes) : "—"}
          </dd>
        </dl>
        {isOngoing && (
          <p className="mt-2 text-xs text-slate-500">※ 退勤打刻後に実労働が確定します。</p>
        )}
      </section>

      {record.note && (
        <section className="rounded-2xl bg-white p-5 text-sm shadow-sm">
          <h2 className="text-xs font-medium text-slate-500">備考</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{record.note}</p>
        </section>
      )}

      <p className="text-center text-xs text-slate-400">
        ※ 出退勤の修正は管理者へ連絡してください。
      </p>
    </main>
  );
}

function BackLink({ ym }: { ym: string }) {
  return (
    <Link
      href={`/me/attendance?ym=${ym}`}
      className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
    >
      ← {Number(ym.split("-")[1])} 月の一覧へ
    </Link>
  );
}
