import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import { updateEmployee, type EmployeeFormValues } from "../../actions";
import { EmployeeForm } from "../../employee-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditEmployeePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const [employee, offices] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!employee) notFound();

  const initial: EmployeeFormValues = {
    lastName: employee.lastName,
    firstName: employee.firstName,
    lastNameKana: employee.lastNameKana,
    firstNameKana: employee.firstNameKana,
    email: employee.user?.email ?? "",
    phone: employee.phone ?? "",
    birthDate: toDateInputValue(employee.birthDate),
    officeId: employee.officeId,
    jobCategory: employee.jobCategory,
    employmentType: employee.employmentType,
    joinedAt: toDateInputValue(employee.joinedAt),
    hiredAt: toDateInputValue(employee.hiredAt),
    weeklyWorkDays: Number(employee.weeklyWorkDays).toString(),
    dailyWorkHours: Number(employee.dailyWorkHours).toString(),
    baseWageType: employee.baseWageType,
    baseWageAmount: employee.baseWageAmount.toString(),
  };

  const fullName = `${employee.lastName} ${employee.firstName}`;
  const action = updateEmployee.bind(null, id);
  const isRetired = employee.retiredAt !== null;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/employees/${id}`} className="hover:underline">
          {fullName}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">編集</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">従業員情報を編集</h1>
      <EmployeeForm
        action={action}
        initial={initial}
        offices={offices}
        submitLabel="保存する"
        meta={{
          employeeCode: employee.employeeCode,
          statusLabel: isRetired ? "退職済" : "在籍中",
          statusTone: isRetired ? "retired" : "active",
        }}
      />
    </div>
  );
}
