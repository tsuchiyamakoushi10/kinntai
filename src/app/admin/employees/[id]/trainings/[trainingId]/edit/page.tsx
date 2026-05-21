import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import { type TrainingRecordFormValues, updateTrainingRecord } from "../../actions";
import { TrainingForm } from "../../training-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; trainingId: string }>;
};

export default async function EditTrainingPage({ params }: Props) {
  await requireAdmin();
  const { id, trainingId } = await params;

  const [employee, training] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      select: { id: true, lastName: true, firstName: true },
    }),
    prisma.trainingRecord.findUnique({ where: { id: trainingId } }),
  ]);

  if (!employee || !training || training.employeeId !== id) notFound();

  const initial: TrainingRecordFormValues = {
    trainingName: training.trainingName,
    trainingType: training.trainingType,
    costYen: training.costYen?.toString() ?? "",
    trainedOn: toDateInputValue(training.trainedOn),
    notes: training.notes ?? "",
  };

  const action = updateTrainingRecord.bind(null, id, trainingId);
  const fullName = `${employee.lastName} ${employee.firstName}`;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/employees/${id}?tab=trainings`} className="hover:underline">
          {fullName}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">研修記録を編集</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">{fullName} の研修記録を編集</h1>

      <TrainingForm action={action} initial={initial} submitLabel="保存する" />
    </div>
  );
}
