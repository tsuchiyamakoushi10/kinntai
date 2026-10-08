"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { checkQuestions, checkSurveyDraft } from "@/lib/training-survey/logic";

export type SurveySaveResult = { ok: true; id: string } | { ok: false; error: string };

function refresh(id?: string) {
  revalidatePath("/admin/training-surveys");
  if (id) revalidatePath(`/admin/training-surveys/${id}`);
  revalidatePath("/me");
  revalidatePath("/me/surveys");
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
  await prisma.trainingSurvey.deleteMany({ where: { id: surveyId, status: "DRAFT" } });
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
