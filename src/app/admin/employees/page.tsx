import { EmploymentStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  JOB_CATEGORY_LABELS,
} from "@/lib/employee-labels";
import {
  normalizeSort,
  sortEmployees,
  type EmployeeSortKey,
  type SortDir,
} from "@/lib/employee-list-sort";
import { formatDate } from "@/lib/format";

import { EmployeeFilters, type EmployeeFilterValues } from "./employee-filters";

export const dynamic = "force-dynamic";

type SearchParams = {
  officeId?: string;
  status?: string;
  q?: string;
  sort?: string;
  dir?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

function normalizeStatus(raw: string | undefined): EmployeeFilterValues["status"] {
  if (raw === "retired" || raw === "all" || raw === "on_leave") return raw;
  return "active";
}

export default async function EmployeeListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;

  const filters: EmployeeFilterValues = {
    officeId: sp.officeId ?? "",
    status: normalizeStatus(sp.status),
    q: (sp.q ?? "").trim(),
    ...normalizeSort(sp.sort, sp.dir),
  };

  const where: Prisma.EmployeeWhereInput = {};
  if (filters.officeId) where.officeId = filters.officeId;
  if (filters.status === "active") where.employmentStatus = EmploymentStatus.ACTIVE;
  else if (filters.status === "on_leave") where.employmentStatus = EmploymentStatus.ON_LEAVE;
  else if (filters.status === "retired") where.employmentStatus = EmploymentStatus.RETIRED;
  if (filters.q) {
    where.OR = [
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastNameKana: { contains: filters.q, mode: "insensitive" } },
      { firstNameKana: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const [rows, offices, officeOrder] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { office: { select: { code: true, name: true } } },
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.office.findMany({ orderBy: { code: "asc" }, select: { id: true } }),
  ]);
  const employees = sortEmployees(
    rows.map((e) => {
      const i = e.officeId ? officeOrder.findIndex((o) => o.id === e.officeId) : -1;
      return { ...e, officeOrder: i >= 0 ? i : null };
    }),
    filters.sort,
    filters.dir,
  );

  // 見出しを押したときの URL (同じ見出しをもう一度押すと逆順)
  const sortHref = (key: EmployeeSortKey): string => {
    const params = new URLSearchParams();
    if (filters.officeId) params.set("officeId", filters.officeId);
    if (filters.status !== "active") params.set("status", filters.status);
    if (filters.q) params.set("q", filters.q);
    const dir: SortDir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
    params.set("sort", key);
    params.set("dir", dir);
    return `/admin/employees?${params.toString()}`;
  };
  const SortTh = ({ k, label }: { k: EmployeeSortKey; label: string }) => {
    const active = filters.sort === k;
    return (
      <th
        className="px-4 py-3 font-medium"
        aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <Link
          href={sortHref(k)}
          className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
          title="押すと並び替え (もう一度押すと逆順)"
        >
          {label}
          <span aria-hidden className={active ? "text-pink-500" : "text-slate-300"}>
            {active ? (filters.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </Link>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">従業員</h1>
          <p className="mt-1 text-sm text-slate-500">{employees.length} 名表示中</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/employees/roster"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            名簿を作る
          </Link>
          <Link
            href="/admin/employees/credentials"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ログイン発行
          </Link>
          <Link
            href="/admin/employees/retired"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            退職者一覧
          </Link>
          <Link
            href="/admin/employees/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            ＋ 新規登録
          </Link>
        </div>
      </header>

      <EmployeeFilters offices={offices} values={filters} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <SortTh k="kana" label="氏名" />
              <SortTh k="office" label="拠点" />
              <SortTh k="job" label="職種" />
              <SortTh k="type" label="雇用形態" />
              <SortTh k="status" label="在籍" />
              <SortTh k="joined" label="入社日" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => {
              const isRetired = e.employmentStatus === EmploymentStatus.RETIRED;
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
                  <td className="px-4 py-3 text-slate-700">{e.office?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {e.jobCategory ? JOB_CATEGORY_LABELS[e.jobCategory] : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusChipClass(e.employmentStatus)}>
                      {EMPLOYMENT_STATUS_LABELS[e.employmentStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.joinedAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/employees/${e.id}/edit`}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                    >
                      編集
                    </Link>
                    {!isRetired && (
                      <Link
                        href={`/admin/employees/${e.id}/retire`}
                        className="ml-3 text-sm font-medium text-red-700 hover:text-red-800 hover:underline"
                      >
                        退職
                      </Link>
                    )}
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

function statusChipClass(status: EmploymentStatus): string {
  const base = "rounded-full px-2 py-0.5 text-xs";
  if (status === EmploymentStatus.ACTIVE) return `${base} bg-emerald-50 text-emerald-700`;
  if (status === EmploymentStatus.ON_LEAVE) return `${base} bg-amber-50 text-amber-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
