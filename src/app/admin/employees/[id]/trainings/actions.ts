"use server";

import { TrainingType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

export type TrainingRecordFormValues = {
  trainingName: string;
  trainingType: string;
  costYen: string;
  trainedOn: string;
  notes: string;
};

export type TrainingRecordFormState = {
  error?: string;
  values?: TrainingRecordFormValues;
};

type Parsed = {
  trainingName: string;
  trainingType: TrainingType;
  costYen: number | null;
  trainedOn: Date;
  notes: string;
};

function readForm(formData: FormData): TrainingRecordFormValues {
  return {
    trainingName: String(formData.get("trainingName") ?? "").trim(),
    trainingType: String(formData.get("trainingType") ?? ""),
    costYen: String(formData.get("costYen") ?? "").trim(),
    trainedOn: String(formData.get("trainedOn") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

function parseAndValidate(
  values: TrainingRecordFormValues,
): { ok: true; data: Parsed } | { ok: false; error: string } {
  if (!values.trainingName || values.trainingName.length > 200) {
    return { ok: false, error: "研修名は 200 文字以内で入力してください。" };
  }
  if (!(values.trainingType in TrainingType)) {
    return { ok: false, error: "研修種別を選択してください。" };
  }

  let costYen: number | null = null;
  if (values.costYen !== "") {
    const n = Number(values.costYen);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) {
      return { ok: false, error: "費用は 0〜10,000,000 円の整数で入力してください。" };
    }
    costYen = n;
  }

  const trainedOn = parseDateInputValue(values.trainedOn);
  if (!trainedOn) {
    return { ok: false, error: "研修日を正しく入力してください。" };
  }

  if (values.notes.length > 500) {
    return { ok: false, error: "備考は 500 文字以内で入力してください。" };
  }

  return {
    ok: true,
    data: {
      trainingName: values.trainingName,
      trainingType: values.trainingType as TrainingType,
      costYen,
      trainedOn,
      notes: values.notes,
    },
  };
}

export async function createTrainingRecord(
  employeeId: string,
  _prev: TrainingRecordFormState,
  formData: FormData,
): Promise<TrainingRecordFormState> {
  await requireAdmin();
  const values = readForm(formData);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return { error: "対象の従業員が見つかりませんでした。", values };

  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  await prisma.trainingRecord.create({
    data: { employeeId, ...parsed.data, notes: parsed.data.notes || null },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return {};
}

export async function updateTrainingRecord(
  employeeId: string,
  trainingId: string,
  _prev: TrainingRecordFormState,
  formData: FormData,
): Promise<TrainingRecordFormState> {
  await requireAdmin();
  const values = readForm(formData);

  const existing = await prisma.trainingRecord.findUnique({
    where: { id: trainingId },
    select: { id: true, employeeId: true },
  });
  if (!existing || existing.employeeId !== employeeId) {
    return { error: "対象の研修記録が見つかりませんでした。", values };
  }

  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  await prisma.trainingRecord.update({
    where: { id: trainingId },
    data: { ...parsed.data, notes: parsed.data.notes || null },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?tab=trainings`);
}

export async function deleteTrainingRecord(employeeId: string, trainingId: string): Promise<void> {
  await requireAdmin();
  const existing = await prisma.trainingRecord.findUnique({
    where: { id: trainingId },
    select: { id: true, employeeId: true },
  });
  // 他従業員の研修記録を消そうとされたら何もしない (URL いじり対策)
  if (!existing || existing.employeeId !== employeeId) return;

  // 修了証 (employee_documents.training_record_id) は ON DELETE SET NULL なので
  // 物理削除しても書類は employee に紐づいたまま残る。書類タブから手動で削除する想定。
  await prisma.trainingRecord.delete({ where: { id: trainingId } });
  revalidatePath(`/admin/employees/${employeeId}`);
}
