import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { createEmployee, type EmployeeFormValues } from "../actions";
import { EmployeeForm } from "../employee-form";

export const dynamic = "force-dynamic";

const EMPTY: EmployeeFormValues = {
  lastName: "",
  firstName: "",
  lastNameKana: "",
  firstNameKana: "",
  email: "",
  phone: "",
  birthDate: "",
  officeId: "",
  jobCategory: "CARE_WORKER",
  employmentType: "FULL_TIME",
  joinedAt: "",
  hiredAt: "",
  weeklyWorkDays: "5",
  dailyWorkHours: "8",
  baseWageType: "MONTHLY",
  baseWageAmount: "230000",
  nightShiftOnly: false,
  nightRequestOnly: false,
  isManager: false,
};

export default async function NewEmployeePage() {
  await requireAdmin();
  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">新規登録</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">従業員を新規登録</h1>
      <p className="-mt-2 text-sm text-slate-500">
        登録するとログイン用アカウントも同時に作成され、初期パスワードは
        <span className="mx-1 font-mono text-slate-700">kinntai0000</span>
        が設定されます。本人へ伝えてください。
      </p>
      <EmployeeForm
        action={createEmployee}
        initial={EMPTY}
        offices={offices}
        submitLabel="登録する"
      />
    </div>
  );
}
