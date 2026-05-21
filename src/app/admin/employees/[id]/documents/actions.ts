"use server";

import { randomUUID } from "node:crypto";

import { DocumentAccessAction, DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { getObjectStorage } from "@/lib/storage";

import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "./limits";

export type DocumentUploadFormValues = {
  title: string;
  documentType: string;
  expiresOn: string;
  notes: string;
  /** 修了証として研修記録に紐付ける場合の training_records.id。空文字 = 未紐付け。 */
  trainingRecordId: string;
};

export type DocumentUploadFormState = {
  error?: string;
  values?: DocumentUploadFormValues;
};

function readForm(formData: FormData): DocumentUploadFormValues {
  return {
    title: String(formData.get("title") ?? "").trim(),
    documentType: String(formData.get("documentType") ?? ""),
    expiresOn: String(formData.get("expiresOn") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    trainingRecordId: String(formData.get("trainingRecordId") ?? "").trim(),
  };
}

export async function uploadEmployeeDocument(
  employeeId: string,
  _prev: DocumentUploadFormState,
  formData: FormData,
): Promise<DocumentUploadFormState> {
  const session = await requireAdmin();
  const userId = session.user.id;
  const values = readForm(formData);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) {
    return { error: "対象の従業員が見つかりませんでした。", values };
  }

  if (!values.title || values.title.length > 200) {
    return { error: "書類名は 200 文字以内で入力してください。", values };
  }
  if (!(values.documentType in DocumentType)) {
    return { error: "書類種別を選択してください。", values };
  }
  if (values.notes.length > 500) {
    return { error: "メモは 500 文字以内で入力してください。", values };
  }

  let expiresOn: Date | null = null;
  if (values.expiresOn) {
    expiresOn = parseDateInputValue(values.expiresOn);
    if (!expiresOn) {
      return { error: "有効期限を正しく入力してください。", values };
    }
  }

  // 修了証として研修記録に紐付ける場合、当該研修記録が同じ従業員のものであることを検証する
  let trainingRecordId: string | null = null;
  if (values.trainingRecordId) {
    const training = await prisma.trainingRecord.findUnique({
      where: { id: values.trainingRecordId },
      select: { id: true, employeeId: true },
    });
    if (!training || training.employeeId !== employeeId) {
      return { error: "選択された研修記録が見つかりませんでした。", values };
    }
    trainingRecordId = training.id;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "ファイルを選択してください。", values };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `ファイルサイズが大きすぎます (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB まで)。`,
      values,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      error: "対応していないファイル形式です。PDF / PNG / JPEG / HEIC のいずれかにしてください。",
      values,
    };
  }

  const body = Buffer.from(await file.arrayBuffer());
  const storage = getObjectStorage();
  const fileId = randomUUID();
  const storageKey = `employees/${employeeId}/${fileId}`;
  const { size } = await storage.put({ key: storageKey, body, contentType: file.type });

  await prisma.employeeDocument.create({
    data: {
      employeeId,
      documentType: values.documentType as DocumentType,
      title: values.title,
      storageKey,
      fileName: sanitizeFileName(file.name),
      mimeType: file.type,
      fileSize: size,
      expiresOn,
      trainingRecordId,
      uploadedById: userId,
      notes: values.notes || null,
    },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return {};
}

export async function deleteEmployeeDocument(
  employeeId: string,
  documentId: string,
): Promise<void> {
  const session = await requireAdmin();
  const userId = session.user.id;

  const doc = await prisma.employeeDocument.findUnique({
    where: { id: documentId },
    select: { id: true, employeeId: true, storageKey: true, deletedAt: true },
  });
  // 別従業員の書類を消そうとされたら何もしない (URL いじり対策)
  if (!doc || doc.employeeId !== employeeId) return;

  if (doc.deletedAt === null) {
    // 監査ログを残してから、論理削除 + ストレージ削除
    await prisma.$transaction([
      prisma.documentAccessLog.create({
        data: {
          documentId,
          userId,
          action: DocumentAccessAction.DELETE,
        },
      }),
      prisma.employeeDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      }),
    ]);
    await getObjectStorage().delete(doc.storageKey);
  }

  revalidatePath(`/admin/employees/${employeeId}`);
}

/**
 * `file.name` をログ / 表示に使うのでパス区切りや制御文字を除去する。
 * 制御文字 (U+0000〜U+001F, U+007F) は ESLint の no-control-regex を避けるため
 * 文字単位で判定する。
 */
function sanitizeFileName(name: string): string {
  const out: string[] = [];
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    if (ch === "\\" || ch === "/") {
      out.push("_");
      continue;
    }
    out.push(ch);
  }
  return out.join("").slice(0, 200);
}
