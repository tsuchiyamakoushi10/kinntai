import type { AttendanceStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatMinutes,
  nightMinutes,
  overtimeMinutes,
  summarize,
} from "@/lib/attendance/aggregate";
import { currentJstYm, fromJstYmd, monthRange, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { approveAttendance, bulkApproveMonth, unapproveAttendance } from "../actions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type Params = { employeeId: string };
type SearchParams = { ym?: string; err?: string };

type PageProps = {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
};

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

const STATUS_BADGE: Record<AttendanceStatus, { label: string; classes: string }> = {
  OPEN: { label: "未承認", classes: "bg-amber-50 text-amber-800" },
  SUBMITTED: { label: "提出済", classes: "bg-blue-50 text-blue-800" },
  APPROVED: { label: "承認済", classes: "bg-emerald-50 text-emerald-800" },
  REJECTED: { label: "差戻し", classes: "bg-red-50 text-red-800" },
};

export default async function AdminAttendanceEmployeePage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { employeeId } = await params;
  const sp = await searchParams;
  if (!UUID.test(employeeId)) notFound();

  const ym = sp.ym && YM_PATTERN.test(sp.ym) ? sp.ym : currentJstYm();
  const range = monthRange(ym);
  const err = sp.err;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeCode: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      dailyWorkHours: true,
      office: { select: { id: true, name: true } },
    },
  });
  if (!employee) notFound();
  const dailyWorkHours = employee.dailyWorkHours?.toNumber() ?? 0;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      workDate: { gte: range.start, lt: range.end },
    },
    include: { breakRecords: { orderBy: { breakStartAt: "asc" } } },
    orderBy: { workDate: "asc" },
  });

  const byYmd = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    byYmd.set(toJstYmd(r.workDate), r);
  }

  let totalWork = 0;
  let totalOvertime = 0;
  let totalNight = 0;
  let attendedDays = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  for (const r of records) {
    if (r.clockInAt) attendedDays += 1;
    const s = summarize({
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakRecords: r.breakRecords,
    });
    totalWork += s.workMinutes;
    totalOvertime += overtimeMinutes(s.workMinutes, dailyWorkHours);
    totalNight += nightMinutes({
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakRecords: r.breakRecords,
    });
    if (r.status === "APPROVED") approvedCount += 1;
    else pendingCount += 1;
  }

  // 一括承認の対象がそもそも存在するか (= 退勤打刻済 + 未承認 が 1 件以上)
  const hasBulkTarget = records.some((r) => r.clockOutAt && r.status !== "APPROVED");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/admin/attendance?ym=${ym}`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← 月別レビュー一覧へ
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {employee.lastName} {employee.firstName}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {employee.lastNameKana} {employee.firstNameKana}
            <span className="ml-2 font-mono text-slate-400">{employee.employeeCode}</span>
            <span className="ml-3">{employee.office?.name ?? "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/attendance/${employeeId}?ym=${range.prevYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="前の月"
          >
            ←
          </Link>
          <span className="min-w-24 text-center text-base font-bold text-slate-900">
            {formatYmDisplay(ym)}
          </span>
          <Link
            href={`/admin/attendance/${employeeId}?ym=${range.nextYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="次の月"
          >
            →
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="出勤日数" value={`${attendedDays} 日`} />
        <SummaryCard label="実労働" value={formatMinutes(totalWork)} />
        <SummaryCard label="残業" value={totalOvertime > 0 ? formatMinutes(totalOvertime) : "—"} />
        <SummaryCard label="深夜" value={totalNight > 0 ? formatMinutes(totalNight) : "—"} />
        <SummaryCard label="未承認" value={`${pendingCount}`} accent={pendingCount > 0} />
        <SummaryCard label="承認済" value={`${approvedCount}`} />
      </section>

      {err && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {err}
        </p>
      )}

      <form action={bulkApproveMonth} className="flex justify-end">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="ym" value={ym} />
        <button
          type="submit"
          disabled={!hasBulkTarget}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          退勤打刻済をまとめて承認
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3 font-medium">日付</th>
              <th className="px-3 py-3 text-right font-medium">出勤</th>
              <th className="px-3 py-3 text-right font-medium">退勤</th>
              <th className="px-3 py-3 text-right font-medium">休憩</th>
              <th className="px-3 py-3 text-right font-medium">実働</th>
              <th className="px-3 py-3 text-right font-medium">残業</th>
              <th className="px-3 py-3 text-right font-medium">深夜</th>
              <th className="px-3 py-3 font-medium">状態</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {range.days.map((ymd) => {
              const rec = byYmd.get(ymd);
              const dow = WEEKDAY.format(fromJstYmd(ymd));
              const day = Number(ymd.slice(-2));
              const dayColor =
                dow === "日" ? "text-red-600" : dow === "土" ? "text-blue-600" : "text-slate-900";
              const summary = rec
                ? summarize({
                    clockInAt: rec.clockInAt,
                    clockOutAt: rec.clockOutAt,
                    breakRecords: rec.breakRecords,
                  })
                : null;
              const overtime = summary ? overtimeMinutes(summary.workMinutes, dailyWorkHours) : 0;
              const night = rec
                ? nightMinutes({
                    clockInAt: rec.clockInAt,
                    clockOutAt: rec.clockOutAt,
                    breakRecords: rec.breakRecords,
                  })
                : 0;
              const badge = rec ? STATUS_BADGE[rec.status] : null;

              return (
                <tr key={ymd}>
                  <td className="px-3 py-2">
                    <span className={`font-medium tabular-nums ${dayColor}`}>{day}</span>
                    <span className={`ml-1.5 text-xs ${dayColor}`}>({dow})</span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                    {formatHm(rec?.clockInAt)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                    {formatHm(rec?.clockOutAt)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                    {summary && summary.breakMinutes > 0
                      ? formatMinutes(summary.breakMinutes)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">
                    {summary && summary.workMinutes > 0 ? formatMinutes(summary.workMinutes) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                    {overtime > 0 ? formatMinutes(overtime) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                    {night > 0 ? formatMinutes(night) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {badge ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rec && rec.clockOutAt && rec.status !== "APPROVED" && (
                      <form action={approveAttendance} className="inline">
                        <input type="hidden" name="recordId" value={rec.id} />
                        <input type="hidden" name="employeeId" value={employeeId} />
                        <input type="hidden" name="ym" value={ym} />
                        <button
                          type="submit"
                          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          承認
                        </button>
                      </form>
                    )}
                    {rec && rec.status === "APPROVED" && (
                      <form action={unapproveAttendance} className="inline">
                        <input type="hidden" name="recordId" value={rec.id} />
                        <input type="hidden" name="employeeId" value={employeeId} />
                        <input type="hidden" name="ym" value={ym} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          取消
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-amber-700" : "text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}
