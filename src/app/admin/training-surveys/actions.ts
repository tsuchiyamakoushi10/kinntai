"use server";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { getObjectStorage, type UploadTarget } from "@/lib/storage";
import { checkQuestions, checkSurveyDraft } from "@/lib/training-survey/logic";
import {
  checkMaterialFile,
  MAX_MATERIAL_BYTES,
  materialStorageKey,
} from "@/lib/training-survey/materials";

export type SurveySaveResult = { ok: true; id: string } | { ok: false; error: string };

function refresh(id?: string) {
  revalidatePath("/admin/training-surveys");
  if (id) revalidatePath(`/admin/training-surveys/${id}`);
  revalidatePath("/me");
  revalidatePath("/me/surveys");
}

export type MaterialUploadResult =
  | { ok: true; storageKey: string; mimeType: string; upload: UploadTarget }
  | { ok: false; error: string };

/**
 * 研修資料のアップロード先を発行する。ファイル本体はブラウザから直接ストレージへ送る
 * (Vercel の関数はリクエストの大きさに上限があるため)。保存時に本体があるか確かめる。
 */
export async function prepareMaterialUpload(
  fileName: string,
  size: number,
): Promise<MaterialUploadResult> {
  await requireAdmin();
  const checked = checkMaterialFile({ fileName, size });
  if (!checked.ok) return checked;
  const storageKey = materialStorageKey(randomUUID());
  try {
    const upload = await getObjectStorage().createUploadUrl(storageKey, checked.value);
    return { ok: true, storageKey, mimeType: checked.value, upload };
  } catch (err) {
    console.error("[training-material] upload sign failed", err);
    return {
      ok: false,
      error: "ファイルの置き場所に接続できませんでした。時間をおいて試してください",
    };
  }
}

/** どのアンケートからも使われなくなったファイル本体を消す (複製したアンケートと共有するため) */
async function deleteUnusedMaterialFiles(storageKeys: ReadonlyArray<string>): Promise<void> {
  if (storageKeys.length === 0) return;
  const stillUsed = await prisma.trainingSurveyMaterial.findMany({
    where: { storageKey: { in: [...storageKeys] } },
    select: { storageKey: true },
  });
  const used = new Set(stillUsed.map((m) => m.storageKey));
  for (const key of new Set(storageKeys)) {
    if (used.has(key)) continue;
    await getObjectStorage()
      .delete(key)
      .catch((err: unknown) => console.error("[training-material] delete failed", err));
  }
}

/**
 * 作成 / 編集の保存。回答が 1 件でもある場合は質問を変えない (回答と質問がずれるため)。
 * 対象者は追加できるが、回答済みの人は外さない。
 */
export async function saveTrainingSurvey(
  surveyId: string | null,
  value: unknown,
): Promise<SurveySaveResult> {
  const session = await requireAdmin();
  const checked = checkSurveyDraft(value);
  if (!checked.ok) return checked;
  const d = checked.value;
  const trainedOn = parseDateInputValue(d.trainedOn);
  const answerUntil = d.answerUntil ? parseDateInputValue(d.answerUntil) : null;
  if (!trainedOn) return { ok: false, error: "研修日を入力してください" };

  // 存在しない従業員 ID を弾く
  const employees = await prisma.employee.findMany({
    where: { id: { in: d.employeeIds } },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);

  // 新しく添付したファイルは、本体がストレージに届いているか・大きさを確かめる
  const oldMaterials = surveyId
    ? await prisma.trainingSurveyMaterial.findMany({ where: { surveyId } })
    : [];
  const oldById = new Map(oldMaterials.map((m) => [m.id, m]));
  const sizeOf = new Map<string, number>();
  for (const m of d.materials) {
    if (m.kind !== "FILE" || oldById.has(m.id)) continue;
    const stat = await getObjectStorage()
      .stat(m.storageKey)
      .catch(() => null);
    if (!stat) {
      return {
        ok: false,
        error: `「${m.fileName}」のアップロードが終わっていません。もう一度添付してください`,
      };
    }
    if (stat.size > MAX_MATERIAL_BYTES) {
      return { ok: false, error: `「${m.fileName}」は大きすぎます` };
    }
    sizeOf.set(m.storageKey, stat.size);
  }

  const meta = {
    title: d.title,
    description: d.description || null,
    trainedOn,
    answerUntil,
    trainingType: d.trainingType,
    officeId: d.officeId,
  };

  const id = await prisma.$transaction(async (tx) => {
    let id: string;
    let responded: string[] = [];
    if (surveyId) {
      const existing = await tx.trainingSurvey.findUnique({
        where: { id: surveyId },
        select: { id: true, responses: { select: { employeeId: true } } },
      });
      if (!existing) throw new Error("not found");
      responded = existing.responses.map((r) => r.employeeId);
      await tx.trainingSurvey.update({ where: { id: surveyId }, data: meta });
      id = surveyId;
    } else {
      const created = await tx.trainingSurvey.create({
        data: { ...meta, createdById: session.user.id },
      });
      id = created.id;
    }

    if (responded.length === 0) {
      await tx.trainingSurveyQuestion.deleteMany({ where: { surveyId: id } });
      await tx.trainingSurveyQuestion.createMany({
        data: d.questions.map((q, i) => ({
          surveyId: id,
          sortOrder: i,
          kind: q.kind,
          label: q.label,
          description: q.description || null,
          options: [...q.options],
          config:
            Object.keys(q.config).length > 0 ? (q.config as Prisma.InputJsonValue) : undefined,
          required: q.required,
        })),
      });
    }

    // 資料: 既存は id を保ったまま更新し (見た記録を残す)、消えたものは削除、新しいものは作る
    await tx.trainingSurveyMaterial.deleteMany({
      where: {
        surveyId: id,
        id: { notIn: d.materials.map((m) => m.id).filter((x) => oldById.has(x)) },
      },
    });
    for (const [i, m] of d.materials.entries()) {
      const old = oldById.get(m.id);
      if (old) {
        await tx.trainingSurveyMaterial.update({
          where: { id: old.id },
          data: {
            sortOrder: i,
            title: m.title,
            mustView: m.mustView,
            ...(old.kind === "LINK" ? { url: m.url } : {}),
          },
        });
        // 動画を差し替えたら、前の動画を見た記録は使えない
        if (old.kind === "LINK" && old.url !== m.url) {
          await tx.trainingSurveyMaterialView.deleteMany({ where: { materialId: old.id } });
        }
      } else if (m.kind === "LINK") {
        await tx.trainingSurveyMaterial.create({
          data: {
            surveyId: id,
            sortOrder: i,
            kind: "LINK",
            title: m.title,
            url: m.url,
            mustView: m.mustView,
          },
        });
      } else {
        await tx.trainingSurveyMaterial.create({
          data: {
            surveyId: id,
            sortOrder: i,
            kind: "FILE",
            title: m.title,
            storageKey: m.storageKey,
            fileName: m.fileName,
            mimeType: m.mimeType,
            sizeBytes: sizeOf.get(m.storageKey) ?? m.sizeBytes,
            mustView: m.mustView,
          },
        });
      }
    }

    const keep = new Set([...employeeIds, ...responded]);
    await tx.trainingSurveyTarget.deleteMany({
      where: { surveyId: id, employeeId: { notIn: [...keep] } },
    });
    await tx.trainingSurveyTarget.createMany({
      data: [...keep].map((employeeId) => ({ surveyId: id, employeeId })),
      skipDuplicates: true,
    });
    return id;
  });

  const keptKeys = new Set(d.materials.map((m) => m.storageKey));
  await deleteUnusedMaterialFiles(
    oldMaterials
      .map((m) => m.storageKey)
      .filter((k): k is string => k !== null && !keptKeys.has(k)),
  );

  refresh(id);
  return { ok: true, id };
}

export async function openTrainingSurvey(surveyId: string): Promise<SurveySaveResult> {
  await requireAdmin();
  const survey = await prisma.trainingSurvey.findUnique({
    where: { id: surveyId },
    select: { _count: { select: { questions: true, targets: true } } },
  });
  if (!survey) return { ok: false, error: "アンケートが見つかりません" };
  if (survey._count.questions === 0)
    return { ok: false, error: "質問を作ってから配信してください" };
  if (survey._count.targets === 0)
    return { ok: false, error: "対象の職員を選んでから配信してください" };
  await prisma.trainingSurvey.update({
    where: { id: surveyId },
    data: { status: "OPEN", openedAt: new Date(), closedAt: null },
  });
  refresh(surveyId);
  return { ok: true, id: surveyId };
}

export async function closeTrainingSurvey(surveyId: string): Promise<void> {
  await requireAdmin();
  await prisma.trainingSurvey.updateMany({
    where: { id: surveyId, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  refresh(surveyId);
}

export async function reopenTrainingSurvey(surveyId: string): Promise<void> {
  await requireAdmin();
  await prisma.trainingSurvey.updateMany({
    where: { id: surveyId, status: "CLOSED" },
    data: { status: "OPEN", closedAt: null },
  });
  refresh(surveyId);
}

/** 下書きだけ削除できる (配信後は回答と研修記録が紐づくため) */
export async function deleteTrainingSurvey(surveyId: string): Promise<void> {
  await requireAdmin();
  const files = await prisma.trainingSurveyMaterial.findMany({
    where: { surveyId, storageKey: { not: null }, survey: { status: "DRAFT" } },
    select: { storageKey: true },
  });
  await prisma.trainingSurvey.deleteMany({ where: { id: surveyId, status: "DRAFT" } });
  await deleteUnusedMaterialFiles(files.map((f) => f.storageKey!));
  refresh();
  redirect("/admin/training-surveys");
}

/** 今の質問一式を「ひな形」として保存する。同じ名前があれば上書き */
export async function saveSurveyTemplate(
  name: string,
  questions: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.length > 50) {
    return { ok: false, error: "ひな形の名前を 50 文字以内で入力してください" };
  }
  const checked = checkQuestions(questions);
  if (!checked.ok) return checked;
  const data = checked.value.map((q) => ({ ...q, id: "" })) as unknown as Prisma.InputJsonValue;
  const existing = await prisma.trainingSurveyTemplate.findFirst({ where: { name: trimmed } });
  if (existing) {
    await prisma.trainingSurveyTemplate.update({
      where: { id: existing.id },
      data: { questions: data },
    });
  } else {
    await prisma.trainingSurveyTemplate.create({ data: { name: trimmed, questions: data } });
  }
  revalidatePath("/admin/training-surveys/new");
  return { ok: true };
}

export async function deleteSurveyTemplate(templateId: string): Promise<void> {
  await requireAdmin();
  await prisma.trainingSurveyTemplate.deleteMany({ where: { id: templateId } });
  revalidatePath("/admin/training-surveys/new");
}
