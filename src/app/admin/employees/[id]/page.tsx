import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  EMPLOYMENT_TYPE_LABELS,
  JOB_CATEGORY_LABELS,
  QUALIFICATION_TYPE_LABELS,
  WAGE_TYPE_LABELS,
} from "@/lib/employee-labels";
import { formatDate, formatYen } from "@/lib/format";

import { DEFAULT_INITIAL_PASSWORD } from "../constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
};

export default async function EmployeeDetailPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      office: { select: { id: true, code: true, name: true } },
      user: { select: { email: true } },
      qualifications: { orderBy: { acquiredOn: "asc" } },
    },
  });
  if (!employee) notFound();

  const fullName = `${employee.lastName} ${employee.firstName}`;
  const fullKana = `${employee.lastNameKana} ${employee.firstNameKana}`;
  const isRetired = employee.retiredAt !== null;
  const weeklyTotal =
    Math.round(Number(employee.weeklyWorkDays) * Number(employee.dailyWorkHours) * 10) / 10;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{fullName}</span>
      </nav>

      {created === "1" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">登録が完了しました。</p>
          <p className="mt-1">
            初期パスワードは <span className="font-mono">{DEFAULT_INITIAL_PASSWORD}</span>{" "}
            です。本人にメールアドレスと合わせて伝え、初回ログイン後に変更してもらってください。
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
            <StatusChip retired={isRetired} />
          </div>
          <p className="text-sm text-slate-500">
            {fullKana}
            <span className="ml-3 font-mono text-xs text-slate-400">{employee.employeeCode}</span>
          </p>
        </div>
        <Link
          href={`/admin/employees/${employee.id}/edit`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          編集
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="基本情報">
          <InfoRow label="氏名" value={fullName} />
          <InfoRow label="フリガナ" value={fullKana} />
          <InfoRow label="生年月日" value={formatDate(employee.birthDate)} />
        </Card>

        <Card title="連絡先">
          <InfoRow label="メール" value={employee.user?.email ?? "—"} />
          <InfoRow label="電話" value={employee.phone ?? "—"} />
        </Card>

        <Card title="所属">
          <InfoRow
            label="拠点"
            value={
              <span>
                {employee.office.name}
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {employee.office.code}
                </span>
              </span>
            }
          />
          <InfoRow label="職種" value={JOB_CATEGORY_LABELS[employee.jobCategory]} />
          <InfoRow label="雇用形態" value={EMPLOYMENT_TYPE_LABELS[employee.employmentType]} />
        </Card>

        <Card title="雇用契約">
          <InfoRow label="入社日" value={formatDate(employee.joinedAt)} />
          <InfoRow label="雇い入れ日" value={formatDate(employee.hiredAt)} />
          {isRetired && <InfoRow label="退職日" value={formatDate(employee.retiredAt)} />}
          <InfoRow
            label="勤務条件"
            value={`週 ${Number(employee.weeklyWorkDays)} 日 × 1 日 ${Number(
              employee.dailyWorkHours,
            )} 時間（週合計 約 ${weeklyTotal} 時間）`}
          />
        </Card>

        <Card title="給与">
          <InfoRow label="給与形態" value={WAGE_TYPE_LABELS[employee.baseWageType]} />
          <InfoRow label="基本給" value={formatYen(employee.baseWageAmount)} />
        </Card>

        <Card title="保有資格">
          {employee.qualifications.length === 0 ? (
            <p className="text-sm text-slate-500">登録された資格はありません。</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {employee.qualifications.map((q) => (
                <li key={q.id} className="flex items-center justify-between">
                  <span>{QUALIFICATION_TYPE_LABELS[q.qualificationType]}</span>
                  <span className="text-xs text-slate-500">取得 {formatDate(q.acquiredOn)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        <p className="font-semibold text-slate-700">今後ここに追加予定</p>
        <ul className="mt-2 list-disc pl-5">
          <li>有給残数・付与履歴（S-A-11）</li>
          <li>月別勤怠サマリ（S-A-10）</li>
          <li>今月の勤務表（S-A-08）</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <dl className="mt-3 flex flex-col gap-2 text-sm">{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}

function StatusChip({ retired }: { retired: boolean }) {
  return retired ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">退職済</span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">在籍中</span>
  );
}
