import Link from "next/link";

import {
  currentJstYm,
  monthRange,
  todayJstDate,
  todayJstYmd,
  toJstYmd,
} from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { evaluateFiveDayRule } from "@/lib/leave/five-day-rule";

export const dynamic = "force-dynamic";

/**
 * S-A-01 管理者ダッシュボード。
 *
 * 「今日 (JST) の現場で何が起きているか」を一画面で見せ、対応が必要な
 * 数字をハイライトする。重い集計はせず、件数 / カウントベースに留める。
 *
 * 構成:
 *   - 上段: 全社サマリ（勤務中 / 承認待ち / 年5日アラート / 在籍）
 *   - 中段: 拠点別の本日状況テーブル
 *   - 下段: 主要画面へのクイックリンク
 */
export default async function AdminDashboardPage() {
  await requireAdmin();

  const today = todayJstDate();
  const ym = currentJstYm();
  const month = monthRange(ym);
  const asOf = todayJstYmd();

  const [offices, todaysAttendance, monthlyPendingCount, employeesForLeave] = await Promise.all([
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { employees: { where: { retiredAt: null } } } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { workDate: today },
      select: {
        officeId: true,
        clockInAt: true,
        clockOutAt: true,
        breakRecords: { select: { breakEndAt: true } },
      },
    }),
    prisma.attendanceRecord.count({
      where: {
        workDate: { gte: month.start, lt: month.end },
        status: { in: ["OPEN", "SUBMITTED"] },
      },
    }),
    prisma.employee.findMany({
      where: { retiredAt: null },
      select: {
        id: true,
        paidLeaveGrants: {
          select: { id: true, grantedOn: true, expiresOn: true, grantedDays: true },
        },
        paidLeaveConsumptions: { select: { consumedOn: true, consumedDays: true } },
      },
    }),
  ]);

  type OfficeStat = {
    id: string;
    name: string;
    activeEmployees: number;
    onShift: number;
    onBreak: number;
    finished: number;
  };

  const byOffice = new Map<string, OfficeStat>();
  for (const o of offices) {
    byOffice.set(o.id, {
      id: o.id,
      name: o.name,
      activeEmployees: o._count.employees,
      onShift: 0,
      onBreak: 0,
      finished: 0,
    });
  }

  for (const a of todaysAttendance) {
    const stat = byOffice.get(a.officeId);
    if (!stat) continue;
    if (!a.clockInAt) continue;
    if (a.clockOutAt) {
      stat.finished += 1;
      continue;
    }
    const openBreak = a.breakRecords.some((b) => b.breakEndAt === null);
    if (openBreak) stat.onBreak += 1;
    else stat.onShift += 1;
  }

  // 年5日アラート: violated + warn を「要対応」として 1 件カウント。watch / ok は集計外。
  let fiveDayWarn = 0;
  let fiveDayViolated = 0;
  for (const e of employeesForLeave) {
    const grants = e.paidLeaveGrants.map((g) => ({
      id: g.id,
      grantedOn: toJstYmd(g.grantedOn),
      expiresOn: toJstYmd(g.expiresOn),
      grantedDays: g.grantedDays.toNumber(),
    }));
    const consumptions = e.paidLeaveConsumptions.map((c) => ({
      consumedOn: toJstYmd(c.consumedOn),
      consumedDays: c.consumedDays.toNumber(),
    }));
    const statuses = evaluateFiveDayRule(grants, consumptions, asOf);
    for (const s of statuses) {
      if (s.severity === "warn") fiveDayWarn += 1;
      else if (s.severity === "violated") fiveDayViolated += 1;
    }
  }

  const stats = Array.from(byOffice.values());
  const totalOnShift = stats.reduce((acc, s) => acc + s.onShift, 0);
  const totalOnBreak = stats.reduce((acc, s) => acc + s.onBreak, 0);
  const totalFinished = stats.reduce((acc, s) => acc + s.finished, 0);
  const totalActive = stats.reduce((acc, s) => acc + s.activeEmployees, 0);
  const fiveDayActionable = fiveDayWarn + fiveDayViolated;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">
          本日 {asOf}・{formatYmDisplay(ym)} の集計
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="勤務中" value={totalOnShift} unit="人" tone="primary" />
        <SummaryCard label="休憩中" value={totalOnBreak} unit="人" tone="muted" />
        <SummaryCard
          label="今月の承認待ち"
          value={monthlyPendingCount}
          unit="件"
          tone={monthlyPendingCount > 0 ? "warning" : "muted"}
          href="/admin/attendance"
        />
        <SummaryCard
          label="年5日アラート"
          value={fiveDayActionable}
          unit="件"
          tone={fiveDayViolated > 0 ? "danger" : fiveDayActionable > 0 ? "warning" : "muted"}
          href="/admin/leave/alerts"
          hint={fiveDayViolated > 0 ? `うち違反 ${fiveDayViolated} 件` : undefined}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">本日の出勤状況</h2>
          <span className="text-xs text-slate-500">
            全社 {totalOnShift + totalOnBreak} / {totalActive} 人が稼働中
          </span>
        </header>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-5 py-2.5 font-medium">拠点</th>
              <th className="px-5 py-2.5 text-right font-medium">在籍</th>
              <th className="px-5 py-2.5 text-right font-medium">勤務中</th>
              <th className="px-5 py-2.5 text-right font-medium">休憩中</th>
              <th className="px-5 py-2.5 text-right font-medium">退勤済</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2.5 font-medium text-slate-900">{s.name}</td>
                <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">
                  {s.activeEmployees}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {s.onShift > 0 ? (
                    <span className="font-semibold text-emerald-700">{s.onShift}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {s.onBreak > 0 ? (
                    <span className="font-semibold text-amber-700">{s.onBreak}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">
                  {s.finished > 0 ? s.finished : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                  稼働中の拠点がありません。
                </td>
              </tr>
            )}
          </tbody>
          {stats.length > 0 && (
            <tfoot className="bg-slate-50 text-slate-700">
              <tr>
                <td className="px-5 py-2.5 font-semibold">全社</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{totalActive}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                  {totalOnShift}
                </td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                  {totalOnBreak}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{totalFinished}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/admin/attendance"
          title="勤怠承認"
          description="月別の打刻を確認して承認します"
        />
        <QuickLink
          href="/admin/shifts"
          title="勤務表"
          description="拠点ごとに月次のシフトを編集します"
        />
        <QuickLink
          href="/admin/leave"
          title="有給管理"
          description="付与・残数の確認と手動付与を行います"
        />
        <QuickLink
          href="/admin/leave/alerts"
          title="年5日アラート"
          description="取得義務に達していない従業員の一覧"
        />
        <QuickLink
          href="/admin/employees"
          title="従業員"
          description="基本情報・雇用契約・タブレット PIN の管理"
        />
        <QuickLink
          href="/admin/shift-patterns"
          title="シフトパターン"
          description="早番・遅番・夜勤などの定義を編集"
        />
      </section>
    </div>
  );
}

function formatYmDisplay(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

type Tone = "primary" | "warning" | "danger" | "muted";

function SummaryCard({
  label,
  value,
  unit,
  tone,
  href,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  tone: Tone;
  href?: string;
  hint?: string;
}) {
  const palette: Record<Tone, string> = {
    primary: "bg-white border-slate-200",
    warning: "bg-amber-50 border-amber-200",
    danger: "bg-rose-50 border-rose-200",
    muted: "bg-white border-slate-200",
  };
  const valueTone: Record<Tone, string> = {
    primary: "text-slate-900",
    warning: "text-amber-800",
    danger: "text-rose-800",
    muted: "text-slate-900",
  };

  const body = (
    <div className={`rounded-xl border p-4 shadow-sm ${palette[tone]}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueTone[tone]}`}>
        {value}
        <span className="ml-1 text-base font-normal text-slate-500">{unit}</span>
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {body}
    </Link>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <span aria-hidden className="text-slate-400">
        →
      </span>
    </Link>
  );
}
