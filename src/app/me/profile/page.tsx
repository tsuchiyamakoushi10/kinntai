import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";

import { changeMyPassword, updateMyContact } from "./actions";
import { ContactForm } from "./contact-form";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

/**
 * S-E-06 プロフィール / パスワード変更。
 *
 * 従業員自身が変更できるのは「電話番号」と「パスワード」のみ。氏名や所属
 * 拠点、雇用情報の修正は管理者経由（人事マスタの整合性を保つため）。
 */
export default async function MyProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const employeeId = session.user.employeeId;
  const userId = session.user.id;

  const [user, employee] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    employeeId
      ? prisma.employee.findUnique({
          where: { id: employeeId },
          select: {
            employeeCode: true,
            lastName: true,
            firstName: true,
            lastNameKana: true,
            firstNameKana: true,
            phone: true,
            jobCategory: true,
            employmentType: true,
            office: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const displayName = employee
    ? `${employee.lastName} ${employee.firstName}`
    : (session.user.name ?? "");
  const displayKana = employee ? `${employee.lastNameKana} ${employee.firstNameKana}` : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header>
        <Link href="/me" className="text-sm text-slate-500 hover:text-slate-700">
          ← ホームに戻る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">プロフィール</h1>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">あなたの情報</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">氏名</dt>
          <dd className="text-right text-slate-900">{displayName}</dd>
          {displayKana && (
            <>
              <dt className="text-slate-500">フリガナ</dt>
              <dd className="text-right text-slate-900">{displayKana}</dd>
            </>
          )}
          {employee && (
            <>
              <dt className="text-slate-500">従業員コード</dt>
              <dd className="text-right font-mono text-xs text-slate-500">
                {employee.employeeCode}
              </dd>
              <dt className="text-slate-500">所属拠点</dt>
              <dd className="text-right text-slate-900">{employee.office.name}</dd>
              <dt className="text-slate-500">職種</dt>
              <dd className="text-right text-slate-900">
                {JOB_CATEGORY_LABELS[employee.jobCategory]}
              </dd>
              <dt className="text-slate-500">雇用形態</dt>
              <dd className="text-right text-slate-900">
                {EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
              </dd>
            </>
          )}
          <dt className="text-slate-500">メール</dt>
          <dd className="text-right text-slate-900">{user?.email ?? "—"}</dd>
        </dl>
      </section>

      {employee && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">連絡先</h2>
          <div className="mt-3">
            <ContactForm action={updateMyContact} initialPhone={employee.phone ?? ""} />
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">パスワード変更</h2>
        <div className="mt-3">
          <PasswordForm action={changeMyPassword} />
        </div>
      </section>
    </main>
  );
}
