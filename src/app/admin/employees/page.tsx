import { Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";
import { formatDate } from "@/lib/format";

import { EmployeeFilters, type EmployeeFilterValues } from "./employee-filters";

export const dynamic = "force-dynamic";

type SearchParams = {
  officeId?: string;
  status?: string;
  q?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

function normalizeStatus(raw: string | undefined): EmployeeFilterValues["status"] {
  return raw === "retired" || raw === "all" ? raw : "active";
}

export default async function EmployeeListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;

  const filters: EmployeeFilterValues = {
    officeId: sp.officeId ?? "",
    status: normalizeStatus(sp.status),
    q: (sp.q ?? "").trim(),
  };

  const where: Prisma.EmployeeWhereInput = {};
  if (filters.officeId) where.officeId = filters.officeId;
  if (filters.status === "active") where.retiredAt = null;
  else if (filters.status === "retired") where.retiredAt = { not: null };
  if (filters.q) {
    where.OR = [
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastNameKana: { contains: filters.q, mode: "insensitive" } },
      { firstNameKana: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const [employees, offices] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { office: { select: { code: true, name: true } } },
      orderBy: [{ retiredAt: { sort: "asc", nulls: "first" } }, { employeeCode: "asc" }],
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">従業員</h1>
          <p className="mt-1 text-sm text-slate-500">{employees.length} 名表示中</p>
        </div>
        <Link
          href="/admin/employees/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新規登録
        </Link>
      </header>

      <EmployeeFilters offices={offices} values={filters} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">拠点</th>
              <th className="px-4 py-3 font-medium">職種</th>
              <th className="px-4 py-3 font-medium">雇用形態</th>
              <th className="px-4 py-3 font-medium">在籍</th>
              <th className="px-4 py-3 font-medium">入社日</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => {
              const isRetired = e.retiredAt !== null;
              return (
                <tr key={e.id} className={isRetired ? "bg-slate-50/60 text-slate-500" : ""}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/employees/${e.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {e.lastName} {e.firstName}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {e.lastNameKana} {e.firstNameKana}
                      <span className="ml-2 font-mono text-slate-400">{e.employeeCode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.office.name}</td>
                  <td className="px-4 py-3 text-slate-700">{JOB_CATEGORY_LABELS[e.jobCategory]}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {EMPLOYMENT_TYPE_LABELS[e.employmentType]}
                  </td>
                  <td className="px-4 py-3">
                    {isRetired ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        退職済
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        在籍中
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.joinedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/employees/${e.id}/edit`}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                    >
                      編集
                    </Link>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  該当する従業員がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
