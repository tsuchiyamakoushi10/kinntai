"use server";

import { ShiftPreferenceStatus, ShiftPreferenceType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

async function updateStatus(preferenceId: string, next: ShiftPreferenceStatus): Promise<void> {
  const session = await requireAdmin();
  const userId = session.user.id;

  await prisma.shiftPreference.update({
    where: { id: preferenceId },
    data: {
      status: next,
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/admin/shift-preferences");
}

export async function acceptShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.ACCEPTED);
}

export async function rejectShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.REJECTED);
}

export async function resetShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.PENDING);
}

export type ProxyPreferenceFormValues = {
  employeeId: string;
  targetDate: string;
  preferenceType: string;
  note: string;
};

export type ProxyPreferenceFormState = {
  error?: string;
  values?: ProxyPreferenceFormValues;
};

function readForm(formData: FormData): ProxyPreferenceFormValues {
  return {
    employeeId: String(formData.get("employeeId") ?? ""),
    targetDate: String(formData.get("targetDate") ?? "").trim(),
    preferenceType: String(formData.get("preferenceType") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  };
}

/**
 * 管理者の代理入力。
 *
 * 紙や口頭で集めた希望を管理者がまとめて打ち込む用。本人による申請ではなく
 * 既に管理者の承認意思が含まれるため、`status = ACCEPTED` で作成する。
 */
export async function createShiftPreferenceByAdmin(
  _prev: ProxyPreferenceFormState,
  formData: FormData,
): Promise<ProxyPreferenceFormState> {
  const session = await requireAdmin();
  const userId = session.user.id;

  const values = readForm(formData);

  if (!values.employeeId) {
    return { error: "従業員を選択してください。", values };
  }
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
        employeeId: values.employeeId,
        targetDate,
        preferenceType: values.preferenceType as ShiftPreferenceType,
        status: ShiftPreferenceStatus.ACCEPTED,
        note: values.note || null,
        createdById: userId,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        error: "同じ従業員・対象日・種別の希望は既に登録されています。",
        values,
      };
    }
    if (isForeignKeyViolation(err)) {
      return { error: "選択した従業員が見つかりませんでした。", values };
    }
    throw err;
  }

  revalidatePath("/admin/shift-preferences");
  return {};
}

/** 代理入力の取り消し。誤入力訂正用。 */
export async function deleteShiftPreference(preferenceId: string): Promise<void> {
  await requireAdmin();
  await prisma.shiftPreference.delete({ where: { id: preferenceId } });
  revalidatePath("/admin/shift-preferences");
}

export type BulkOffFormState = {
  error?: string;
  saved?: number;
};

/**
 * カレンダー一括入力。
 *
 * 指定従業員 × 指定月の 希望休 (REQUESTED_OFF) と 有給 (PAID_LEAVE) を、フォーム送信時の
 * 選択状態で「上書き」する (両種別とも当月分を消して入れ直し)。希望夜勤・勤務不可は触らない。
 *
 * formData: "requestedOff" / "paidLeave" に YYYY-MM-DD カンマ区切りで入る前提 (1 日 1 種別)。
 */
export async function bulkSetMonthlyOffPreferences(
  _prev: BulkOffFormState,
  formData: FormData,
): Promise<BulkOffFormState> {
  const session = await requireAdmin();
  const userId = session.user.id;

  const employeeId = String(formData.get("employeeId") ?? "");
  const ym = String(formData.get("ym") ?? "");

  if (!employeeId) return { error: "従業員を選択してください。" };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return { error: "対象月が不正です。" };

  const parseDates = (raw: string): string[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s.startsWith(`${ym}-`));

  const offDates = parseDates(String(formData.get("requestedOff") ?? ""));
  const paidDates = parseDates(String(formData.get("paidLeave") ?? ""));

  // 月境界
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const monthStart = new Date(`${ym}-01T00:00:00.000Z`);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthEnd = new Date(`${nextYm}-01T00:00:00.000Z`);

  // 既存従業員の検証 (FK エラー前にチェック)
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return { error: "選択した従業員が見つかりませんでした。" };

  const rows = [
    ...offDates.map((d) => ({ date: d, type: ShiftPreferenceType.REQUESTED_OFF })),
    ...paidDates.map((d) => ({ date: d, type: ShiftPreferenceType.PAID_LEAVE })),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.shiftPreference.deleteMany({
      where: {
        employeeId,
        preferenceType: { in: [ShiftPreferenceType.REQUESTED_OFF, ShiftPreferenceType.PAID_LEAVE] },
        targetDate: { gte: monthStart, lt: monthEnd },
      },
    });
    if (rows.length > 0) {
      await tx.shiftPreference.createMany({
        data: rows.map((r) => ({
          employeeId,
          targetDate: new Date(`${r.date}T00:00:00.000Z`),
          preferenceType: r.type,
          status: ShiftPreferenceStatus.ACCEPTED,
          createdById: userId,
          reviewedById: userId,
          reviewedAt: new Date(),
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidatePath("/admin/shift-preferences");
  return { saved: rows.length };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2003"
  );
}
