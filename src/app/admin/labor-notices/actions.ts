"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/app/admin/employees/[id]/documents/limits";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { computeNotice } from "@/lib/labor-notice/compute";
import { TEMPLATE_VERSION } from "@/lib/labor-notice/constants";
import { toContractData, toEmployeeSnapshot } from "@/lib/labor-notice/contract-mapping";
import { loadNoticeMasters, NOTICE_TYPE_TO_DB } from "@/lib/labor-notice/load";
import { formatNoticeNo, nextNoticeSeq } from "@/lib/labor-notice/notice-number";
import { parseAcknowledgements, parseNoticeInput } from "@/lib/labor-notice/parse";
import type { NoticeInput } from "@/lib/labor-notice/types";
import { getObjectStorage } from "@/lib/storage";

export type NoticeActionResult = { ok: true; id: string } | { ok: false; error: string };

type Payload = {
  noticeId: string | null;
  employeeId: string;
  input: unknown;
  acknowledgements: unknown;
  /** 無効にした通知書の作り直し。その通知書の契約データを上書きする */
  replacesNoticeId: string | null;
};

async function loadEmployee(employeeId: string) {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, lastName: true, firstName: true },
  });
}

async function loadDraft(noticeId: string, employeeId: string) {
  const n = await prisma.laborNotice.findUnique({
    where: { id: noticeId },
    select: { id: true, status: true, employeeId: true },
  });
  if (!n || n.employeeId !== employeeId || n.status !== "DRAFT") return null;
  return n;
}

/** 入力を検証し、従業員名は DB の値で上書きする (画面の値を信用しない) */
async function prepare(
  payload: Payload,
): Promise<{ ok: true; input: NoticeInput } | { ok: false; error: string }> {
  const employee = await loadEmployee(payload.employeeId);
  if (!employee) return { ok: false, error: "従業員が見つかりませんでした。" };
  const parsed = parseNoticeInput(payload.input);
  if (!parsed)
    return { ok: false, error: "入力内容を読み取れませんでした。画面を開き直してください。" };
  return {
    ok: true,
    input: { ...parsed, employeeName: `${employee.lastName} ${employee.firstName}` },
  };
}

export async function saveLaborNoticeDraft(payload: Payload): Promise<NoticeActionResult> {
  const session = await requireAdmin();
  const prepared = await prepare(payload);
  if (!prepared.ok) return prepared;
  const { input } = prepared;
  const startOn = parseDateInputValue(input.contractStartOn);
  if (!startOn) return { ok: false, error: "契約の開始日を入力してください。" };
  const office = await prisma.office.findUnique({
    where: { id: input.officeId },
    select: { id: true },
  });
  if (!office) return { ok: false, error: "勤務先を選んでください。" };

  const data = {
    noticeType: NOTICE_TYPE_TO_DB[input.employmentType],
    officeId: office.id,
    input: input as unknown as Prisma.InputJsonValue,
    templateVersion: TEMPLATE_VERSION,
    contractStartOn: startOn,
  };

  let id: string;
  if (payload.noticeId) {
    const draft = await loadDraft(payload.noticeId, payload.employeeId);
    if (!draft) return { ok: false, error: "この下書きはもう編集できません。" };
    await prisma.laborNotice.update({ where: { id: draft.id }, data });
    id = draft.id;
  } else {
    const created = await prisma.laborNotice.create({
      data: { ...data, employeeId: payload.employeeId, createdById: session.user.id },
    });
    id = created.id;
  }
  revalidatePath("/admin/labor-notices");
  return { ok: true, id };
}

export async function issueLaborNotice(payload: Payload): Promise<NoticeActionResult> {
  const session = await requireAdmin();
  const prepared = await prepare(payload);
  if (!prepared.ok) return prepared;
  const { input } = prepared;

  const acks = parseAcknowledgements(payload.acknowledgements);
  if (!acks) return { ok: false, error: "確認の内容を読み取れませんでした。" };

  const loaded = await loadNoticeMasters();
  if (!loaded)
    return { ok: false, error: "会社情報が未登録です。設定 → 会社情報 で登録してください。" };

  const result = computeNotice(input, loaded.masters);
  if (!result.view || result.errors.length > 0) {
    return {
      ok: false,
      error: `入力が足りません：${result.errors.map((e) => e.message).join("／")}`,
    };
  }
  const view = result.view;
  for (const w of result.warnings) {
    const ack = acks.find((a) => a.code === w.code);
    if (!ack || ack.reason === "") {
      return { ok: false, error: `「${w.message}」を確認し、理由を入力してください。` };
    }
  }

  if (payload.noticeId && !(await loadDraft(payload.noticeId, payload.employeeId))) {
    return { ok: false, error: "この下書きはもう発行できません。" };
  }

  let replacedContractId: string | null = null;
  if (payload.replacesNoticeId) {
    const replaced = await prisma.laborNotice.findUnique({
      where: { id: payload.replacesNoticeId },
      select: { employeeId: true, status: true, contractId: true },
    });
    if (!replaced || replaced.employeeId !== payload.employeeId || replaced.status !== "VOID") {
      return { ok: false, error: "作り直し元の通知書が見つかりませんでした。" };
    }
    replacedContractId = replaced.contractId;
  }

  const contract = toContractData(input, view);
  const snapshot = toEmployeeSnapshot(input, contract);
  const now = new Date();
  const acknowledgements = result.warnings.map((w) => ({
    code: w.code,
    message: w.message,
    reason: acks.find((a) => a.code === w.code)?.reason ?? "",
    acknowledgedBy: session.user.id,
    acknowledgedAt: now.toISOString(),
  }));
  const year = Number(view.issuedOn.slice(0, 4));
  const prefix = loaded.noticeNumberPrefix;

  const contractFields = {
    contractStartOn: parseDateInputValue(contract.contractStartOn),
    contractEndOn: contract.contractEndOn ? parseDateInputValue(contract.contractEndOn) : null,
    employmentType: contract.employmentType,
    workingHoursPerDay: contract.workingHoursPerDay,
    workingDaysPerWeek: contract.workingDaysPerWeek,
    wageType: contract.wageType,
    wageAmount: contract.wageAmount,
    isRenewable: contract.isRenewable,
    renewalCriteria: contract.renewalCriteria,
    hasEmploymentInsurance: contract.hasEmploymentInsurance,
    hasSocialInsurance: contract.hasSocialInsurance,
    workplaceInitial: contract.workplaceInitial,
    workplaceScope: contract.workplaceScope,
    jobDescriptionInitial: contract.jobDescriptionInitial,
    jobDescriptionScope: contract.jobDescriptionScope,
    weeklyHoursCategory: contract.weeklyHoursCategory,
    shiftBasedSchedule: contract.shiftBasedSchedule,
    hasOvertime: contract.hasOvertime,
    hasBonus: contract.hasBonus,
    bonusDescription: contract.bonusDescription,
  };

  // 番号の採番が他の発行と衝突したら (unique 違反) 取り直す
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const id = await prisma.$transaction(async (tx) => {
        const existing = await tx.laborNotice.findMany({
          where: { noticeNo: { startsWith: `${prefix}-${year}-` } },
          select: { noticeNo: true },
        });
        const noticeNo = formatNoticeNo(
          year,
          nextNoticeSeq(
            existing.map((e) => e.noticeNo ?? ""),
            year,
            prefix,
          ),
          prefix,
        );

        const contractRow = replacedContractId
          ? await tx.employmentContract.update({
              where: { id: replacedContractId },
              data: { ...contractFields, notes: `労働条件通知書 ${noticeNo} で作り直し` },
            })
          : await tx.employmentContract.create({
              data: {
                ...contractFields,
                employeeId: payload.employeeId,
                notes: `労働条件通知書 ${noticeNo} から作成`,
              },
            });

        await tx.employee.update({ where: { id: payload.employeeId }, data: snapshot });

        const data = {
          noticeNo,
          status: "ISSUED" as const,
          noticeType: NOTICE_TYPE_TO_DB[input.employmentType],
          officeId: input.officeId,
          contractId: contractRow.id,
          input: input as unknown as Prisma.InputJsonValue,
          snapshot: view as unknown as Prisma.InputJsonValue,
          acknowledgements: acknowledgements as unknown as Prisma.InputJsonValue,
          templateVersion: TEMPLATE_VERSION,
          contractStartOn: contractRow.contractStartOn ?? now,
          contractEndOn: contractRow.contractEndOn,
          issuedAt: now,
          issuedById: session.user.id,
        };
        if (payload.noticeId) {
          await tx.laborNotice.update({ where: { id: payload.noticeId }, data });
          return payload.noticeId;
        }
        const created = await tx.laborNotice.create({
          data: { ...data, employeeId: payload.employeeId, createdById: session.user.id },
        });
        return created.id;
      });
      revalidatePath("/admin/labor-notices");
      revalidatePath(`/admin/employees/${payload.employeeId}`);
      return { ok: true, id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "通知書番号の採番に失敗しました。もう一度お試しください。" };
}

export async function deleteLaborNoticeDraft(noticeId: string): Promise<void> {
  await requireAdmin();
  await prisma.laborNotice.deleteMany({ where: { id: noticeId, status: "DRAFT" } });
  revalidatePath("/admin/labor-notices");
  redirect("/admin/labor-notices");
}

/** 発行済みを無効にする。番号は欠番として残し、契約データはそのまま (作り直しで上書きする) */
export async function voidLaborNotice(noticeId: string): Promise<void> {
  await requireAdmin();
  await prisma.laborNotice.updateMany({
    where: { id: noticeId, status: { in: ["ISSUED", "SIGNED"] } },
    data: { status: "VOID", voidedAt: new Date() },
  });
  revalidatePath("/admin/labor-notices");
  revalidatePath(`/admin/labor-notices/${noticeId}`);
}

export type SignedUploadState = { error?: string; done?: boolean };

/** 本人が署名した 3 枚目 (同意書 兼 受領書) のスキャンを保存して signed にする */
export async function uploadSignedLaborNotice(
  noticeId: string,
  _prev: SignedUploadState,
  formData: FormData,
): Promise<SignedUploadState> {
  const session = await requireAdmin();
  const notice = await prisma.laborNotice.findUnique({
    where: { id: noticeId },
    select: { id: true, status: true, employeeId: true, contractId: true, noticeNo: true },
  });
  if (!notice || (notice.status !== "ISSUED" && notice.status !== "SIGNED")) {
    return { error: "発行済みの通知書だけ登録できます。" };
  }
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

  await prisma.$transaction(async (tx) => {
    const doc = await tx.employeeDocument.create({
      data: {
        employeeId: notice.employeeId,
        documentType: "LABOR_CONDITIONS_NOTICE",
        title: `労働条件通知書 同意書 兼 受領書（${notice.noticeNo ?? ""}）`,
        storageKey,
        // 元のファイル名は氏名を含みがちなので保存しない
        fileName: `${notice.noticeNo ?? "labor-notice"}-signed.${ext}`,
        mimeType: file.type,
        fileSize: size,
        contractId: notice.contractId,
        uploadedById: session.user.id,
      },
    });
    await tx.laborNotice.update({
      where: { id: notice.id },
      data: { status: "SIGNED", signedAt: new Date(), signedDocumentId: doc.id },
    });
  });

  revalidatePath(`/admin/labor-notices/${noticeId}`);
  revalidatePath("/admin/labor-notices");
  revalidatePath(`/admin/employees/${notice.employeeId}`);
  return { done: true };
}
