import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { checkQuestions, type SurveyDraft } from "@/lib/training-survey/logic";

import { loadTargetOffices, toSurveyQuestion } from "../data";
import { SurveyEditor } from "../survey-editor";
import { TemplatePicker } from "../template-picker";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ copy?: string; template?: string }> };

const DEFAULT_QUESTIONS: SurveyDraft["questions"] = [
  {
    id: "",
    kind: "SCALE",
    label: "研修の内容はわかりやすかったですか？",
    description: "",
    options: [],
    config: { min: 1, max: 5, minLabel: "わかりにくかった", maxLabel: "とてもわかりやすかった" },
    required: true,
  },
  {
    id: "",
    kind: "SCALE",
    label: "明日からの仕事に役立ちそうですか？",
    description: "",
    options: [],
    config: { min: 1, max: 5, minLabel: "役立たない", maxLabel: "とても役立つ" },
    required: true,
  },
  {
    id: "",
    kind: "TEXT",
    label: "感想・質問があれば書いてください",
    description: "",
    options: [],
    config: {},
    required: false,
  },
];

/** S-A-36 研修アンケート 作成。?copy=<id> で質問と配る相手を複製する */
export default async function NewTrainingSurveyPage({ searchParams }: Props) {
  await requireAdmin();
  const { copy, template } = await searchParams;
  const templates = await prisma.trainingSurveyTemplate.findMany({ orderBy: { name: "asc" } });
  const picked = template ? templates.find((t) => t.id === template) : undefined;
  const pickedQuestions = picked ? checkQuestions(picked.questions) : null;
  const today = toDateInputValue(new Date());

  let initial: SurveyDraft = {
    title: "",
    description: "",
    trainedOn: today,
    answerUntil: null,
    trainingType: "COMPANY_PAID",
    officeId: null,
    questions: pickedQuestions?.ok ? pickedQuestions.value : DEFAULT_QUESTIONS,
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
      {!copy && (
        <TemplatePicker
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            count: Array.isArray(t.questions) ? t.questions.length : 0,
          }))}
          selectedId={picked?.id ?? null}
        />
      )}
      <SurveyEditor
        key={picked?.id ?? copy ?? "default"}
        surveyId={null}
        initial={initial}
        offices={await loadTargetOffices()}
        questionsLocked={false}
        respondedEmployeeIds={[]}
      />
    </div>
  );
}
