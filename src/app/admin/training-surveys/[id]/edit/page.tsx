import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import { loadTargetOffices, toSurveyQuestion } from "../../data";
import { SurveyEditor } from "../../survey-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** S-A-36 研修アンケート 編集 */
export default async function EditTrainingSurveyPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const survey = await prisma.trainingSurvey.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      targets: { select: { employeeId: true } },
      responses: { select: { employeeId: true } },
    },
  });
  if (!survey) notFound();

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/training-surveys" className="hover:underline">
          研修アンケート
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/training-surveys/${id}`} className="hover:underline">
          {survey.title}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">編集</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">研修アンケートを編集</h1>
      <SurveyEditor
        surveyId={survey.id}
        initial={{
          title: survey.title,
          description: survey.description ?? "",
          trainedOn: toDateInputValue(survey.trainedOn),
          answerUntil: survey.answerUntil ? toDateInputValue(survey.answerUntil) : null,
          trainingType: survey.trainingType,
          officeId: survey.officeId,
          questions: survey.questions.map(toSurveyQuestion),
          employeeIds: survey.targets.map((t) => t.employeeId),
        }}
        offices={await loadTargetOffices()}
        questionsLocked={survey.responses.length > 0}
        respondedEmployeeIds={survey.responses.map((r) => r.employeeId)}
      />
    </div>
  );
}
