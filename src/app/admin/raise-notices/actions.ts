"use server";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/app/admin/employees/[id]/documents/limits";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { toNoticeCompany } from "@/lib/labor-notice/load";
import { checkRaise, KIND_TO_WAGE_TYPE, parseRaiseInput } from "@/lib/raise-notice/rows";
import type { RaiseView } from "@/lib/raise-notice/types";
import { getObjectStorage } from "@/lib/storage";

export type RaiseActionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * 昇給通知を発行する。同時に従業員の賃金と最新の雇用契約の賃金を変更後の金額に書き換える
 * (次の労働条件通知書も新しい金額から始まる)。docs/raise-notice.md §1。
 */
export async function issueRaiseNotice(payload: {
  employeeId: string;
  input: unknown;
}): Promise<RaiseActionResult> {
  const session = await requireAdmin();
  const input = parseRaiseInput(payload.input);
  if (!input)
    return { ok: false, error: "入力内容を読み取れませんでした。画面を開き直してください。" };
  const check = checkRaise(input);
  if (check.errors.length > 0) return { ok: false, error: check.errors.join("／") };
  const issuedOn = parseDateInputValue(input.issuedOn);
  const effectiveOn = parseDateInputValue(input.effectiveOn);
  if (!issuedOn || !effectiveOn) return { ok: false, error: "日付を入力してください。" };

  const [employee, profile, latestNotice] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        office: { select: { id: true, name: true } },
      },
    }),
    prisma.companyProfile.findFirst(),
    prisma.laborNotice.findFirst({
      where: { employeeId: payload.employeeId, status: { in: ["ISSUED", "SIGNED"] } },
      orderBy: { issuedAt: "desc" },
      select: { contractId: true, office: { select: { id: true, name: true } } },
    }),
  ]);
  if (!employee) return { ok: false, error: "従業員が見つかりませんでした。" };
  if (!profile)
    return { ok: false, error: "会社情報が未登録です。設定 → 会社情報 で登録してください。" };
  const office = latestNotice?.office ?? employee.office;
  if (!office) return { ok: false, error: "従業員の所属拠点を登録してください。" };

  const contractId =
    latestNotice?.contractId ??
    (
      await prisma.employmentContract.findFirst({
        where: { employeeId: employee.id },
        orderBy: [{ contractStartOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        select: { id: true },
      })
    )?.id ??
    null;

  const company = toNoticeCompany(profile);
  const view: RaiseView = {
    ...input,
    employeeName: `${employee.lastName} ${employee.firstName}`,
    company: {
      name: company.name,
      address: company.address,
      representative: company.representative,
    },
    officeName: office.name,
  };
  const wageType = KIND_TO_WAGE_TYPE[input.kind];
  // checkRaise で変更後の基本の金額があることは確かめてある
  const baseAfter = input.rows.find((r) => r.key === "BASE")?.afterYen ?? 0;

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.raiseNotice.create({
      data: {
        employeeId: employee.id,
        officeId: office.id,
        contractId,
        issuedOn,
        effectiveOn,
        snapshot: view as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    });
    if (contractId) {
      await tx.employmentContract.update({
        where: { id: contractId },
        data: { wageType, wageAmount: baseAfter },
      });
    }
    await tx.employee.update({
      where: { id: employee.id },
      data: { baseWageType: wageType, baseWageAmount: baseAfter },
    });
    return created.id;
  });

  revalidatePath("/admin/raise-notices");
  revalidatePath(`/admin/employees/${employee.id}`);
  return { ok: true, id };
}

/** 「完了」フォルダへ移す / 「作業中」へ戻す */
export async function setRaiseNoticeArchived(noticeId: string, archived: boolean): Promise<void> {
  await requireAdmin();
  await prisma.raiseNotice.updateMany({
    where: { id: noticeId },
    data: { archivedAt: archived ? new Date() : null },
  });
  revalidatePath("/admin/raise-notices");
  revalidatePath(`/admin/raise-notices/${noticeId}`);
}

/** 間違えたときに消す。書き換えた賃金は元に戻さない (正しい内容で作り直してもらう) */
export async function deleteRaiseNotice(noticeId: string): Promise<void> {
  await requireAdmin();
  await prisma.raiseNotice.deleteMany({ where: { id: noticeId } });
  revalidatePath("/admin/raise-notices");
  redirect("/admin/raise-notices");
}

export type RaiseSignedUploadState = { error?: string; done?: boolean };

/** 本人が署名した受領書のスキャンを保存し、完了フォルダへ移す */
export async function uploadSignedRaiseNotice(
  noticeId: string,
  _prev: RaiseSignedUploadState,
  formData: FormData,
): Promise<RaiseSignedUploadState> {
  const session = await requireAdmin();
  const notice = await prisma.raiseNotice.findUnique({
    where: { id: noticeId },
    select: { id: true, employeeId: true, contractId: true, issuedOn: true },
  });
  if (!notice) return { error: "昇給通知が見つかりませんでした。" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "ファイルを選んでください。" };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `ファイルが大きすぎます (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB まで)。`,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: "PDF / PNG / JPEG / HEIC のいずれかにしてください。" };
  }

  const body = Buffer.from(await file.arrayBuffer());
  const storageKey = `employees/${notice.employeeId}/${randomUUID()}`;
  const { size } = await getObjectStorage().put({ key: storageKey, body, contentType: file.type });
  const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] ?? "bin");
  const day = notice.issuedOn.toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    const doc = await tx.employeeDocument.create({
      data: {
        employeeId: notice.employeeId,
        documentType: "OTHER",
        title: `昇給通知書 受領書（${day}）`,
        storageKey,
        // 元のファイル名は氏名を含みがちなので保存しない
        fileName: `raise-notice-${day}-signed.${ext}`,
        mimeType: file.type,
        fileSize: size,
        contractId: notice.contractId,
        uploadedById: session.user.id,
      },
    });
    const now = new Date();
    await tx.raiseNotice.update({
      where: { id: notice.id },
      data: { signedAt: now, signedDocumentId: doc.id, archivedAt: now },
    });
  });

  revalidatePath(`/admin/raise-notices/${noticeId}`);
  revalidatePath("/admin/raise-notices");
  revalidatePath(`/admin/employees/${notice.employeeId}`);
  return { done: true };
}
