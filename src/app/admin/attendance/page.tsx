import { Prisma } from "@prisma/client";
import Link from "next/link";

import {
  formatMinutes,
  nightMinutes,
  overtimeMinutes,
  summarize,
} from "@/lib/attendance/aggregate";
import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { AttendanceFilters } from "./attendance-filters";

export const dynamic = "force-dynamic";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type SearchParams = { ym?: string; officeId?: string };
type Props = { searchParams: Promise<SearchParams> };

function formatYmDisplay(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export default async function AdminAttendanceListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const ym = sp.ym && YM_PATTERN.test(sp.ym) ? sp.ym : currentJstYm();
  const officeId = sp.officeId ?? "";
  const range = monthRange(ym);

  const recordWhere: Prisma.AttendanceRecordWhereInput = {
    workDate: { gte: range.start, lt: range.end },
  };
  if (officeId) recordWhere.employee = { officeId };

  const [records, offices] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: recordWhere,
      include: {
        breakRecords: { orderBy: { breakStartAt: "asc" } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            lastName: true,
            firstName: true,
            lastNameKana: true,
            firstNameKana: true,
            dailyWorkHours: true,
            office: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  // 従業員ごとに集計
  type EmployeeRow = {
    id: string;
    code: string;
    name: string;
    kana: string;
    officeName: string;
    dailyWorkHours: number;
    attendedDays: number;
    totalWorkMinutes: number;
    totalOvertimeMinutes: number;
    totalNightMinutes: number;
    pendingCount: number; // OPEN + SUBMITTED + REJECTED
    approvedCount: number;
  };

  const byEmployee = new Map<string, EmployeeRow>();
  for (const r of records) {
    const e = r.employee;
    let row = byEmployee.get(e.id);
    if (!row) {
      row = {
        id: e.id,
        code: e.employeeCode,
        name: `${e.lastName} ${e.firstName}`,
        kana: `${e.lastNameKana} ${e.firstNameKana}`,
        officeName: e.office.name,
        dailyWorkHours: e.dailyWorkHours.toNumber(),
        attendedDays: 0,
        totalWorkMinutes: 0,
        totalOvertimeMinutes: 0,
        totalNightMinutes: 0,
        pendingCount: 0,
        approvedCount: 0,
      };
      byEmployee.set(e.id, row);
    }
    if (r.clockInAt) row.attendedDays += 1;
    const s = summarize({
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakRecords: r.breakRecords,
    });
    row.totalWorkMinutes += s.workMinutes;
    row.totalOvertimeMinutes += overtimeMinutes(s.workMinutes, row.dailyWorkHours);
    row.totalNightMinutes += nightMinutes({
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      breakRecords: r.breakRecords,
    });
    if (r.status === "APPROVED") row.approvedCount += 1;
    else row.pendingCount += 1;
  }

  const rows = Array.from(byEmployee.values()).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">勤怠承認</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatYmDisplay(ym)}・{rows.length} 名表示中
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/attendance?ym=${range.prevYm}${officeId ? `&officeId=${officeId}` : ""}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="前の月"
          >
            ←
          </Link>
          <span className="min-w-24 text-center text-base font-bold text-slate-900">
            {formatYmDisplay(ym)}
          </span>
          <Link
            href={`/admin/attendance?ym=${range.nextYm}${officeId ? `&officeId=${officeId}` : ""}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="次の月"
          >
            →
          </Link>
        </div>
      </header>

      <AttendanceFilters offices={offices} values={{ ym, officeId }} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">拠点</th>
              <th className="px-4 py-3 text-right font-medium">出勤日数</th>
              <th className="px-4 py-3 text-right font-medium">実労働</th>
              <th className="px-4 py-3 text-right font-medium">残業</th>
              <th className="px-4 py-3 text-right font-medium">深夜</th>
              <th className="px-4 py-3 text-right font-medium">未承認</th>
              <th className="px-4 py-3 text-right font-medium">承認済</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/attendance/${r.id}?ym=${ym}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.kana}
                    <span className="ml-2 font-mono text-slate-400">{r.code}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.officeName}</td>
                <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                  {r.attendedDays} 日
                </td>
                <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                  {formatMinutes(r.totalWorkMinutes)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                  {r.totalOvertimeMinutes > 0 ? formatMinutes(r.totalOvertimeMinutes) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                  {r.totalNightMinutes > 0 ? formatMinutes(r.totalNightMinutes) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.pendingCount > 0 ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {r.pendingCount}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                  {r.approvedCount}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/attendance/${r.id}?ym=${ym}`}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  この月に打刻のある従業員はいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
