import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatDate, toDateInputValue } from "@/lib/format";
import { canAnswer, type Answers } from "@/lib/training-survey/logic";

import { AnswerForm } from "./answer-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** S-E-12 アンケート回答 (職員) */
export default async function AnswerSurveyPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;
  const { id } = await params;
  if (!employeeId) notFound();

  const survey = await prisma.trainingSurvey.findFirst({
    where: { id, status: { not: "DRAFT" }, targets: { some: { employeeId } } },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      responses: { where: { employeeId }, select: { answers: true } },
    },
  });
  if (!survey) notFound();

  const open = canAnswer(
    {
      status: survey.status,
      answerUntil: survey.answerUntil ? toDateInputValue(survey.answerUntil) : null,
    },
    toDateInputValue(new Date()),
  );
  const previous = (survey.responses[0]?.answers as Answers | undefined) ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header className="flex flex-col gap-2">
        <Link
          href="/me/surveys"
          className="w-fit rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          ← 戻る
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{survey.title}</h1>
        <p className="text-sm text-slate-600">
          研修日 {formatDate(survey.trainedOn)}
          {survey.answerUntil && `　回答は${formatDate(survey.answerUntil)}まで`}
        </p>
        {survey.description && (
          <p className="rounded-xl bg-white p-4 text-sm whitespace-pre-wrap text-slate-700 shadow-sm">
            {survey.description}
          </p>
        )}
      </header>
      <AnswerForm
        surveyId={survey.id}
        questions={survey.questions.map((q) => ({
          id: q.id,
          kind: q.kind,
          label: q.label,
          options: q.options,
          required: q.required,
        }))}
        initial={previous}
        open={open}
      />
    </main>
  );
}
