import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // 退職済（retired_at が未来含めて入っている）従業員も後で扱うが、
  // 現段階では「在籍中」のみカウント。
  const [officeCount, employeeCount] = await Promise.all([
    prisma.office.count({ where: { isActive: true } }),
    prisma.employee.count({ where: { retiredAt: null } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">ダッシュボード</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="稼働中の拠点" value={officeCount} unit="拠点" />
        <Stat label="在籍中の従業員" value={employeeCount} unit="人" />
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">次にやること</h2>
        <p className="mt-2 text-sm text-slate-600">
          左のメニューから「拠点設定」を開いて、登録済みの 5 拠点を確認・編集できます。従業員管理 /
          シフト関連は次のスライスで追加します。
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">
        {value}
        <span className="ml-1 text-base font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}
