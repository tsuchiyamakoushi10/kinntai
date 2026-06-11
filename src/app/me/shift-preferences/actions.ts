"use server";

import { ShiftPreferenceStatus, ShiftPreferenceType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { STAFF_SHIFT_PREFERENCE_TYPES } from "@/lib/employee-labels";
import { parseDateInputValue } from "@/lib/format";
import type { BulkOffFormState } from "@/lib/shift-preference-bulk";

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
  // 本人が出せるのは 希望休 / 夜勤希望 / 有給 のみ（勤務不可は管理者代理入力）。
  if (!STAFF_SHIFT_PREFERENCE_TYPES.includes(values.preferenceType as ShiftPreferenceType)) {
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
 * 本人によるカレンダー一括入力。管理側の `bulkSetMonthlyOffPreferences` と同じ操作だが、
 * - employeeId はセッションから取得（なりすまし防止）。
 * - 提出は `status = PENDING`（管理者承認で確定）。管理者の代理入力は ACCEPTED で作るのと対比。
 *
 * 指定月の 希望休 / 有給 / 夜勤希望 を送信状態で「上書き」する（当月のこれら3種別を消して入れ直し）。
 * 勤務不可 (UNAVAILABLE) は触らない。
 */
export async function bulkSetMyMonthlyPreferences(
  _prev: BulkOffFormState,
  formData: FormData,
): Promise<BulkOffFormState> {
  const session = await requireSession();
  const userId = session.user.id;
  const employeeId = session.user.employeeId;
  if (!employeeId) {
    return { error: "従業員情報が紐づいていないため希望を出せません。" };
  }

  const ym = String(formData.get("ym") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    return { error: "対象月が不正です。" };
  }

  const parseDates = (raw: string): string[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s.startsWith(`${ym}-`));

  const offDates = parseDates(String(formData.get("requestedOff") ?? ""));
  const paidDates = parseDates(String(formData.get("paidLeave") ?? ""));
  const nightDates = parseDates(String(formData.get("preferredNight") ?? ""));

  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const monthStart = new Date(`${ym}-01T00:00:00.000Z`);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthEnd = new Date(`${nextYm}-01T00:00:00.000Z`);

  const rows = [
    ...offDates.map((d) => ({ date: d, type: ShiftPreferenceType.REQUESTED_OFF })),
    ...paidDates.map((d) => ({ date: d, type: ShiftPreferenceType.PAID_LEAVE })),
    ...nightDates.map((d) => ({ date: d, type: ShiftPreferenceType.PREFERRED_NIGHT })),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.shiftPreference.deleteMany({
      where: {
        employeeId,
        preferenceType: {
          in: [
            ShiftPreferenceType.REQUESTED_OFF,
            ShiftPreferenceType.PAID_LEAVE,
            ShiftPreferenceType.PREFERRED_NIGHT,
          ],
        },
        targetDate: { gte: monthStart, lt: monthEnd },
      },
    });
    if (rows.length > 0) {
      await tx.shiftPreference.createMany({
        data: rows.map((r) => ({
          employeeId,
          targetDate: new Date(`${r.date}T00:00:00.000Z`),
          preferenceType: r.type,
          status: ShiftPreferenceStatus.PENDING,
          createdById: userId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidatePath("/me/shift-preferences");
  return { saved: rows.length };
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
