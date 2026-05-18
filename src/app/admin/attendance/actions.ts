"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function fail(employeeId: string, ym: string, message: string): never {
  redirect(`/admin/attendance/${employeeId}?ym=${ym}&err=${encodeURIComponent(message)}`);
}

/**
 * 1 件の勤怠を承認する。退勤未済 (clockOutAt = null) は承認させない。
 * 進行中の打刻を間違って締めるリスクを避ける。
 */
export async function approveAttendance(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const recordId = String(formData.get("recordId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const ym = String(formData.get("ym") ?? "");
  if (!UUID.test(recordId) || !UUID.test(employeeId) || !YM_PATTERN.test(ym)) {
    redirect("/admin/attendance");
  }

  const rec = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    select: { clockOutAt: true, status: true, employeeId: true },
  });
  if (!rec || rec.employeeId !== employeeId) {
    fail(employeeId, ym, "対象の勤怠が見つかりませんでした。");
  }
  if (!rec.clockOutAt) {
    fail(employeeId, ym, "退勤打刻が未完了のため承認できません。");
  }
  if (rec.status === "APPROVED") {
    // 二重承認はサイレントに成功扱い
    redirect(`/admin/attendance/${employeeId}?ym=${ym}`);
  }

  await prisma.attendanceRecord.update({
    where: { id: recordId },
    data: {
      status: "APPROVED",
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath(`/admin/attendance/${employeeId}`);
  revalidatePath("/admin/attendance");
  redirect(`/admin/attendance/${employeeId}?ym=${ym}`);
}

/**
 * 承認を取り消す。誤承認の救済用。
 */
export async function unapproveAttendance(formData: FormData): Promise<void> {
  await requireAdmin();
  const recordId = String(formData.get("recordId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const ym = String(formData.get("ym") ?? "");
  if (!UUID.test(recordId) || !UUID.test(employeeId) || !YM_PATTERN.test(ym)) {
    redirect("/admin/attendance");
  }

  await prisma.attendanceRecord.update({
    where: { id: recordId },
    data: {
      status: "OPEN",
      approvedBy: null,
      approvedAt: null,
    },
  });

  revalidatePath(`/admin/attendance/${employeeId}`);
  revalidatePath("/admin/attendance");
  redirect(`/admin/attendance/${employeeId}?ym=${ym}`);
}

/**
 * 指定従業員の指定月のうち、退勤打刻済みで未承認のものをまとめて承認する。
 * 進行中・出勤未済は対象外。
 */
export async function bulkApproveMonth(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const employeeId = String(formData.get("employeeId") ?? "");
  const ym = String(formData.get("ym") ?? "");
  if (!UUID.test(employeeId) || !YM_PATTERN.test(ym)) {
    redirect("/admin/attendance");
  }
  const range = monthRange(ym);

  await prisma.attendanceRecord.updateMany({
    where: {
      employeeId,
      workDate: { gte: range.start, lt: range.end },
      clockOutAt: { not: null },
      status: { not: "APPROVED" },
    },
    data: {
      status: "APPROVED",
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath(`/admin/attendance/${employeeId}`);
  revalidatePath("/admin/attendance");
  redirect(`/admin/attendance/${employeeId}?ym=${ym}`);
}
