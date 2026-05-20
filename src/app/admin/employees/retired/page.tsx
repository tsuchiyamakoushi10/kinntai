import { EmploymentStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = {
  officeId?: string;
  q?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function RetiredEmployeesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;

  const filters = {
    officeId: sp.officeId ?? "",
    q: (sp.q ?? "").trim(),
  };

  const where: Prisma.EmployeeWhereInput = {
    employmentStatus: EmploymentStatus.RETIRED,
  };
  if (filters.officeId) where.officeId = filters.officeId;
  if (filters.q) {
    where.OR = [
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastNameKana: { contains: filters.q, mode: "insensitive" } },
      { firstNameKana: { contains: filters.q, mode: "insensitive" } },
      { retirementReason: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const [employees, offices] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { office: { select: { code: true, name: true } } },
      orderBy: [{ retiredAt: "desc" }, { employeeCode: "asc" }],
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const isFiltered = filters.officeId !== "" || filters.q !== "";

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">退職者一覧</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">退職者一覧</h1>
          <p className="mt-1 text-sm text-slate-500">
            {employees.length} 名表示中 / 退職者データは削除されません（労基法上の保存義務）
          </p>
        </div>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="flex min-w-44 flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-slate-600">最終所属拠点</span>
          <select
            name="officeId"
            defaultValue={filters.officeId}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">すべて</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-slate-600">氏名・フリガナ・退職理由検索</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="例: 山田 / 一身上の都合"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          絞り込む
        </button>

        {isFiltered && (
          <Link href="/admin/employees/retired" className="text-sm text-slate-600 hover:underline">
            条件をリセット
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">最終所属</th>
              <th className="px-4 py-3 font-medium">職種 / 雇用形態</th>
              <th className="px-4 py-3 font-medium">雇い入れ日</th>
              <th className="px-4 py-3 font-medium">退職日</th>
              <th className="px-4 py-3 font-medium">退職理由</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => (
              <tr key={e.id} className="text-slate-700">
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
                <td className="px-4 py-3">{e.office.name}</td>
                <td className="px-4 py-3">
                  <div>{JOB_CATEGORY_LABELS[e.jobCategory]}</div>
                  <div className="text-xs text-slate-500">
                    {EMPLOYMENT_TYPE_LABELS[e.employmentType]}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(e.hiredAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(e.retiredAt)}</td>
                <td className="px-4 py-3 text-slate-700">
                  <span className="whitespace-pre-wrap">{e.retirementReason ?? "—"}</span>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  該当する退職者がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
