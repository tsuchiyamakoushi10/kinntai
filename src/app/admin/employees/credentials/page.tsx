import { EmploymentStatus } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { CredentialIssuer, type IssuerEmployee } from "./issuer";

export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
  await requireAdmin();

  const employees = await prisma.employee.findMany({
    where: { employmentStatus: EmploymentStatus.ACTIVE },
    orderBy: { employeeCode: "asc" },
    select: {
      id: true,
      employeeCode: true,
      lastName: true,
      firstName: true,
      office: { select: { name: true } },
      user: { select: { loginId: true } },
    },
  });

  const rows: IssuerEmployee[] = employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: `${e.lastName} ${e.firstName}`,
    officeName: e.office?.name ?? null,
    loginId: e.user?.loginId ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ログイン発行</h1>
          <p className="mt-1 text-sm text-slate-500">
            職員のログインID・初期パスワードを発行します。職員はこのIDでスマホからログインし、
            希望休・夜勤・有給の申請ができます。
          </p>
        </div>
        <Link
          href="/admin/employees"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← 従業員一覧
        </Link>
      </header>

      <CredentialIssuer employees={rows} />
    </div>
  );
}
