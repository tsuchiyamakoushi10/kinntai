import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatMinutes, summarize } from "@/lib/attendance/aggregate";
import { currentJstYm, fromJstYmd, monthRange, toJstYmd } from "@/lib/attendance/business-date";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ym?: string }>;
};

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const WEEKDAY = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

const HM = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatHm(d: Date | null | undefined): string {
  if (!d) return "—";
  return HM.format(d);
}

function formatYmDisplay(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export default async function MyAttendancePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;

  const params = await searchParams;
  const ymRaw = params.ym ?? "";
  const ym = YM_PATTERN.test(ymRaw) ? ymRaw : currentJstYm();
  const range = monthRange(ym);
  const todayYmd = toJstYmd(new Date());

  // 従業員紐付きが無い管理者などはガード
  if (!employeeId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
        <Header ym={ym} prevYm={range.prevYm} nextYm={range.nextYm} />
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          このアカウントには従業員情報が紐づいていません。
        </p>
      </main>
    );
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      workDate: { gte: range.start, lt: range.end },
    },
    include: { breakRecords: { orderBy: { breakStartAt: "asc" } } },
    orderBy: { workDate: "asc" },
  });

  // YYYY-MM-DD でルックアップしやすいよう Map 化
  const byYmd = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    byYmd.set(toJstYmd(r.workDate), r);
  }

  // 月合計: 確定した実労働分の合計 / 出勤日数
  let totalWorkMin = 0;
  let attendedDays = 0;
  for (const r of records) {
    if (r.clockInAt) attendedDays += 1;
    const s = summarize({
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakRecords: r.breakRecords,
    });
    totalWorkMin += s.workMinutes;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
      <Header ym={ym} prevYm={range.prevYm} nextYm={range.nextYm} />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">出勤日数</dt>
          <dd className="text-right text-slate-900 tabular-nums">{attendedDays} 日</dd>
          <dt className="text-slate-500">実労働 (確定分)</dt>
          <dd className="text-right text-slate-900 tabular-nums">{formatMinutes(totalWorkMin)}</dd>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">日付</th>
              <th className="px-2 py-2 text-right font-medium">出勤</th>
              <th className="px-2 py-2 text-right font-medium">退勤</th>
              <th className="px-2 py-2 text-right font-medium">休憩</th>
              <th className="px-3 py-2 text-right font-medium">実働</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {range.days.map((ymd) => {
              const rec = byYmd.get(ymd);
              const summary = rec
                ? summarize({
                    clockInAt: rec.clockInAt,
                    clockOutAt: rec.clockOutAt,
                    breakRecords: rec.breakRecords,
                  })
                : null;
              const dow = WEEKDAY.format(fromJstYmd(ymd));
              const day = Number(ymd.slice(-2));
              const isToday = ymd === todayYmd;
              const dayColor =
                dow === "日" ? "text-red-600" : dow === "土" ? "text-blue-600" : "text-slate-900";

              const breakCell =
                summary && summary.breakMinutes > 0 ? formatMinutes(summary.breakMinutes) : "—";
              const workCell =
                summary && summary.workMinutes > 0 ? formatMinutes(summary.workMinutes) : "—";

              // 記録がある日だけ詳細リンクを張る。td 全体を Link 化すると hydration が
              // 重くなるので、日付セルだけリンクにする。
              const dayLabel = (
                <>
                  <span className={`font-medium tabular-nums ${dayColor}`}>{day}</span>
                  <span className={`ml-1.5 text-xs ${dayColor}`}>({dow})</span>
                </>
              );

              return (
                <tr key={ymd} className={isToday ? "bg-amber-50" : undefined}>
                  <td className="px-3 py-2">
                    {rec ? (
                      <Link
                        href={`/me/attendance/${ymd}`}
                        className="hover:underline"
                        aria-label={`${ymd} の詳細`}
                      >
                        {dayLabel}
                      </Link>
                    ) : (
                      dayLabel
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700 tabular-nums">
                    {formatHm(rec?.clockInAt)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700 tabular-nums">
                    {formatHm(rec?.clockOutAt)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700 tabular-nums">{breakCell}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">
                    {workCell}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-center text-xs text-slate-400">
        ※ 出退勤の修正は管理者へ連絡してください。
      </p>
    </main>
  );
}

function Header({ ym, prevYm, nextYm }: { ym: string; prevYm: string; nextYm: string }) {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/me"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        ← ホーム
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href={`/me/attendance?ym=${prevYm}`}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
          aria-label="前の月"
        >
          ←
        </Link>
        <span className="min-w-24 text-center text-base font-bold text-slate-900">
          {formatYmDisplay(ym)}
        </span>
        <Link
          href={`/me/attendance?ym=${nextYm}`}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
          aria-label="次の月"
        >
          →
        </Link>
      </div>
    </header>
  );
}
