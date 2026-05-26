import Link from "next/link";

import { currentJstYm, todayJstDate, todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { DOCUMENT_TYPE_LABELS } from "@/lib/employee-labels";
import { formatDate } from "@/lib/format";
import { evaluateFiveDayRule } from "@/lib/leave/five-day-rule";

export const dynamic = "force-dynamic";

/**
 * S-A-01 管理者ダッシュボード。
 *
 * 「今日 (JST) の現場で何が起きているか」を一画面で見せ、対応が必要な
 * 数字をハイライトする。
 *
 * 勤怠 (打刻) は現運用では未使用のため、勤務中 / 休憩中 / 承認待ち /
 * 本日の出勤状況テーブル / 勤怠承認 リンクは非表示。
 */
export default async function AdminDashboardPage() {
  await requireAdmin();

  const today = todayJstDate();
  const ym = currentJstYm();
  const asOf = todayJstYmd();

  // 書類期限アラート: 期限切れ + 30 日以内に期限切れになるものを件数集計し、上位を一覧で出す。
  const docWarnUntil = new Date(today);
  docWarnUntil.setDate(docWarnUntil.getDate() + 30);

  const [offices, employeesForLeave, expiringDocs, expiredDocsCount] = await Promise.all([
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { employees: { where: { retiredAt: null } } } },
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
    prisma.employeeDocument.findMany({
      where: {
        deletedAt: null,
        expiresOn: { not: null, lte: docWarnUntil },
        employee: { retiredAt: null },
      },
      orderBy: { expiresOn: "asc" },
      take: 10,
      select: {
        id: true,
        title: true,
        documentType: true,
        expiresOn: true,
        employee: { select: { id: true, lastName: true, firstName: true } },
      },
    }),
    prisma.employeeDocument.count({
      where: {
        deletedAt: null,
        expiresOn: { not: null, lt: today },
        employee: { retiredAt: null },
      },
    }),
  ]);

  type OfficeStat = {
    id: string;
    name: string;
    activeEmployees: number;
  };

  const officeStats: OfficeStat[] = offices.map((o) => ({
    id: o.id,
    name: o.name,
    activeEmployees: o._count.employees,
  }));

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

  const totalActive = officeStats.reduce((acc, s) => acc + s.activeEmployees, 0);
  const fiveDayActionable = fiveDayWarn + fiveDayViolated;
  const expiringDocsCount = expiringDocs.length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">
          本日 {asOf}・{formatYmDisplay(ym)} の集計
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="在籍" value={totalActive} unit="人" tone="primary" />
        <SummaryCard
          label="年5日アラート"
          value={fiveDayActionable}
          unit="件"
          tone={fiveDayViolated > 0 ? "danger" : fiveDayActionable > 0 ? "warning" : "muted"}
          href="/admin/leave/alerts"
          hint={fiveDayViolated > 0 ? `うち違反 ${fiveDayViolated} 件` : undefined}
        />
        <SummaryCard
          label="書類の期限"
          value={expiringDocsCount}
          unit="件"
          tone={expiredDocsCount > 0 ? "danger" : expiringDocsCount > 0 ? "warning" : "muted"}
          hint={
            expiredDocsCount > 0
              ? `うち期限切れ ${expiredDocsCount} 件`
              : expiringDocsCount > 0
                ? "30 日以内に期限"
                : undefined
          }
        />
      </section>

      {expiringDocsCount > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-800">期限が近い / 切れている書類</h2>
            <span className="text-xs text-slate-500">最大 10 件まで表示</span>
          </header>
          <ul className="divide-y divide-slate-100">
            {expiringDocs.map((d) => {
              if (d.expiresOn === null) return null;
              const expired = d.expiresOn.getTime() < today.getTime();
              return (
                <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="flex flex-col">
                    <Link
                      href={`/admin/employees/${d.employee.id}?tab=documents`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {d.employee.lastName} {d.employee.firstName}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {DOCUMENT_TYPE_LABELS[d.documentType]} ／ {d.title}
                    </span>
                  </div>
                  <span
                    className={
                      expired
                        ? "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"
                        : "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                    }
                  >
                    {formatDate(d.expiresOn)}
                    {expired ? " (期限切れ)" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">拠点別 在籍人数</h2>
          <span className="text-xs text-slate-500">全社 {totalActive} 人</span>
        </header>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-5 py-2.5 font-medium">拠点</th>
              <th className="px-5 py-2.5 text-right font-medium">在籍</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {officeStats.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2.5 font-medium text-slate-900">{s.name}</td>
                <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">
                  {s.activeEmployees}
                </td>
              </tr>
            ))}
            {officeStats.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-slate-500">
                  拠点がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/admin/shifts"
          title="勤務表"
          description="拠点ごとに月次のシフトを編集します"
        />
        <QuickLink
          href="/admin/shift-preferences"
          title="シフト希望"
          description="紙で集めた希望休を月別に登録します"
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
        <QuickLink href="/admin/employees" title="従業員" description="基本情報・雇用契約の管理" />
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
