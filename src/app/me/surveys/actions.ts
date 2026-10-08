"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { toSurveyQuestion } from "@/lib/training-survey/from-db";
import { canAnswer, checkAnswers } from "@/lib/training-survey/logic";

export type AnswerResult = { ok: true } | { ok: false; error: string };

/**
 * 職員のアンケート回答。回答すると研修記録を自動で付ける (1 回答 1 件。直したときは更新)。
 * docs/training-survey.md §3
 */
export async function submitSurveyAnswer(surveyId: string, raw: unknown): Promise<AnswerResult> {
  const session = await auth();
  const employeeId = session?.user?.employeeId;
  if (!employeeId) return { ok: false, error: "ログインし直してください" };

  const survey = await prisma.trainingSurvey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      targets: { where: { employeeId }, select: { employeeId: true } },
      responses: { where: { employeeId }, select: { id: true, trainingRecordId: true } },
    },
  });
  if (!survey || survey.targets.length === 0) {
    return { ok: false, error: "このアンケートは見つかりませんでした" };
  }
  if (
    !canAnswer(
      {
        status: survey.status,
        answerUntil: survey.answerUntil ? toDateInputValue(survey.answerUntil) : null,
      },
      toDateInputValue(new Date()),
    )
  ) {
    return { ok: false, error: "このアンケートの受付は終わりました" };
  }

  const checked = checkAnswers(survey.questions.map(toSurveyQuestion), raw);
  if (!checked.ok) return checked;
  const answers = checked.value as Prisma.InputJsonValue;
  const existing = survey.responses[0];

  await prisma.$transaction(async (tx) => {
    const record = {
      trainingName: survey.title,
      trainingType: survey.trainingType,
      trainedOn: survey.trainedOn,
    };
    let trainingRecordId = existing?.trainingRecordId ?? null;
    if (trainingRecordId) {
      // 管理者が研修記録を消していたら作り直す
      const updated = await tx.trainingRecord.updateMany({
        where: { id: trainingRecordId, employeeId },
        data: record,
      });
      if (updated.count === 0) trainingRecordId = null;
    }
    if (!trainingRecordId) {
      const created = await tx.trainingRecord.create({
        data: { ...record, employeeId, notes: "研修アンケートの回答から自動で作成" },
      });
      trainingRecordId = created.id;
    }

    if (existing) {
      await tx.trainingSurveyResponse.update({
        where: { id: existing.id },
        data: { answers, trainingRecordId },
      });
    } else {
      await tx.trainingSurveyResponse.create({
        data: { surveyId, employeeId, answers, trainingRecordId },
      });
    }
  });

  revalidatePath("/me");
  revalidatePath("/me/surveys");
  revalidatePath(`/admin/training-surveys/${surveyId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
  return { ok: true };
}
