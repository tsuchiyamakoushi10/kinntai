import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import type { SurveyDraft } from "@/lib/training-survey/logic";

import { loadTargetOffices, toSurveyQuestion } from "../data";
import { SurveyEditor } from "../survey-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ copy?: string }> };

const DEFAULT_QUESTIONS: SurveyDraft["questions"] = [
  {
    id: "",
    kind: "RATING_5",
    label: "研修の内容はわかりやすかったですか？",
    options: ["わかりにくかった", "とてもわかりやすかった"],
    required: true,
  },
  {
    id: "",
    kind: "RATING_5",
    label: "明日からの仕事に役立ちそうですか？",
    options: ["役立たない", "とても役立つ"],
    required: true,
  },
  { id: "", kind: "TEXT", label: "感想・質問があれば書いてください", options: [], required: false },
];

/** S-A-36 研修アンケート 作成。?copy=<id> で質問と配る相手を複製する */
export default async function NewTrainingSurveyPage({ searchParams }: Props) {
  await requireAdmin();
  const { copy } = await searchParams;
  const today = toDateInputValue(new Date());

  let initial: SurveyDraft = {
    title: "",
    description: "",
    trainedOn: today,
    answerUntil: null,
    trainingType: "COMPANY_PAID",
    officeId: null,
    questions: DEFAULT_QUESTIONS,
    employeeIds: [],
  };
  if (copy) {
    const src = await prisma.trainingSurvey.findUnique({
      where: { id: copy },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        targets: { select: { employeeId: true } },
      },
    });
    if (src) {
      initial = {
        title: `${src.title}（コピー）`,
        description: src.description ?? "",
        trainedOn: today,
        answerUntil: null,
        trainingType: src.trainingType,
        officeId: src.officeId,
        questions: src.questions.map(toSurveyQuestion),
        employeeIds: src.targets.map((t) => t.employeeId),
      };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/training-surveys" className="hover:underline">
          研修アンケート
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">作成</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">研修アンケートを作る</h1>
      <SurveyEditor
        surveyId={null}
        initial={initial}
        offices={await loadTargetOffices()}
        questionsLocked={false}
        respondedEmployeeIds={[]}
      />
    </div>
  );
}
