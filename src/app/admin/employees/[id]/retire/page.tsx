import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate, toDateInputValue } from "@/lib/format";

import { retireEmployee } from "../../actions";
import { RetireForm } from "../../retire-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RetireEmployeePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      employeeCode: true,
      lastName: true,
      firstName: true,
      hiredAt: true,
      joinedAt: true,
      retiredAt: true,
    },
  });
  if (!employee) notFound();
  if (employee.retiredAt) {
    // 既に退職済の場合は詳細画面に戻す
    redirect(`/admin/employees/${id}`);
  }

  const fullName = `${employee.lastName} ${employee.firstName}`;
  const action = retireEmployee.bind(null, id);
  // 退職日のデフォルトは今日にしておくと事務処理の流れに沿いやすい
  const today = new Date();
  const initial = {
    retiredAt: toDateInputValue(today),
    notes: "",
  };

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
        <span className="text-slate-700">退職処理</span>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">退職処理</h1>
        <p className="text-sm text-slate-500">
          {fullName}（{employee.employeeCode}） / 雇い入れ日 {formatDate(employee.hiredAt)}
        </p>
      </header>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">退職処理を行うと次のことが起きます。</p>
        <ul className="mt-2 list-disc pl-5">
          <li>従業員一覧の「退職済」フィルタに表示が移ります。</li>
          <li>ログインアカウントは自動的に無効化され、本人はログインできなくなります。</li>
          <li>
            勤怠データ・シフト履歴・有給付与履歴は <strong>削除されず</strong>{" "}
            残ります（労基法上の保存義務）。
          </li>
        </ul>
        <p className="mt-2">
          ※ 有給残数の失効（基準日から 2 年）は今回は自動処理されません。
          手動調整は次のスライスで追加される有給管理画面から行う予定です。
        </p>
      </section>

      <RetireForm action={action} initial={initial} employeeId={id} />
    </div>
  );
}
