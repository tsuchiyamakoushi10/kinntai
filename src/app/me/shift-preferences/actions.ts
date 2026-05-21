"use server";

import { ShiftPreferenceStatus, ShiftPreferenceType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

export type ShiftPreferenceFormValues = {
  targetDate: string;
  preferenceType: string;
  note: string;
};

export type ShiftPreferenceFormState = {
  error?: string;
  values?: ShiftPreferenceFormValues;
};

function readForm(formData: FormData): ShiftPreferenceFormValues {
  return {
    targetDate: String(formData.get("targetDate") ?? "").trim(),
    preferenceType: String(formData.get("preferenceType") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  };
}

/**
 * 本人による希望追加。
 *
 * - employeeId はセッションから取得。クライアントからは受け取らない (なりすまし防止)。
 * - 同じ (employee, date, type) は unique 制約があるので create 失敗したら既存扱い。
 * - status は PENDING で作成。管理者が S-A-25 で承認する。
 */
export async function createShiftPreference(
  _prev: ShiftPreferenceFormState,
  formData: FormData,
): Promise<ShiftPreferenceFormState> {
  const session = await requireSession();
  const userId = session.user.id;
  const employeeId = session.user.employeeId;
  if (!employeeId) {
    return {
      error: "従業員情報が紐づいていないため希望を出せません。",
      values: readForm(formData),
    };
  }

  const values = readForm(formData);

  const targetDate = parseDateInputValue(values.targetDate);
  if (!targetDate) {
    return { error: "対象日を正しく入力してください。", values };
  }
  if (!(values.preferenceType in ShiftPreferenceType)) {
    return { error: "希望種別を選択してください。", values };
  }
  if (values.note.length > 500) {
    return { error: "メモは 500 文字以内で入力してください。", values };
  }

  try {
    await prisma.shiftPreference.create({
      data: {
        employeeId,
        targetDate,
        preferenceType: values.preferenceType as ShiftPreferenceType,
        status: ShiftPreferenceStatus.PENDING,
        note: values.note || null,
        createdById: userId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "その日付・種別の希望は既に登録されています。", values };
    }
    throw err;
  }

  revalidatePath("/me/shift-preferences");
  return {};
}

/**
 * 本人による希望取り消し。
 * 管理者承認後 (ACCEPTED/REJECTED) でも削除可だが、確定シフト側は別途調整が必要。
 */
export async function deleteShiftPreferenceByEmployee(preferenceId: string): Promise<void> {
  const session = await requireSession();
  const employeeId = session.user.employeeId;
  if (!employeeId) return;

  const pref = await prisma.shiftPreference.findUnique({
    where: { id: preferenceId },
    select: { id: true, employeeId: true },
  });
  if (!pref || pref.employeeId !== employeeId) return;

  await prisma.shiftPreference.delete({ where: { id: preferenceId } });
  revalidatePath("/me/shift-preferences");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
