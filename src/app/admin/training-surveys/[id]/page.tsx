import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import {
  formatAnswer,
  summarize,
  type Answers,
  type QuestionSummary,
  type SurveyQuestion,
} from "@/lib/training-survey/logic";

import { toSurveyQuestion } from "../data";
import { SURVEY_STATUS_CLASS, SURVEY_STATUS_LABEL } from "../labels";
import { SurveyControls } from "./survey-controls";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; person?: string }>;
};

type Tab = "summary" | "people" | "pending";

const dateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** S-A-37 研修アンケート 結果 */
export default async function TrainingSurveyResultPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = sp.tab === "people" || sp.tab === "pending" ? sp.tab : "summary";

  const survey = await prisma.trainingSurvey.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      targets: {
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              lastName: true,
              firstName: true,
              office: { select: { name: true } },
            },
          },
        },
      },
      responses: {
        select: { employeeId: true, answers: true, submittedAt: true, updatedAt: true },
      },
    },
  });
  if (!survey) notFound();

  const questions: SurveyQuestion[] = survey.questions.map(toSurveyQuestion);
  const people = survey.targets
    .map((t) => t.employee)
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const nameOf = (e: { lastName: string; firstName: string }) => `${e.lastName} ${e.firstName}`;
  const responseOf = new Map(survey.responses.map((r) => [r.employeeId, r]));
  const responders = people.filter((p) => responseOf.has(p.id));
  const pendingPeople = people.filter((p) => !responseOf.has(p.id));
  const summaries = summarize(
    questions,
    responders.map((p) => ({
      employeeName: nameOf(p),
      answers: responseOf.get(p.id)!.answers as Answers,
    })),
  );

  const base = `/admin/training-surveys/${id}`;
  const tabs: ReadonlyArray<[Tab, string]> = [
    ["summary", "まとめ"],
    ["people", `個別（${responders.length}人）`],
    ["pending", `未回答（${pendingPeople.length}人）`],
  ];

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/training-surveys" className="hover:underline">
          研修アンケート
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{survey.title}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{survey.title}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SURVEY_STATUS_CLASS[survey.status]}`}
          >
            {SURVEY_STATUS_LABEL[survey.status]}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          研修日 {formatDate(survey.trainedOn)}　／　期限{" "}
          {survey.answerUntil ? formatDate(survey.answerUntil) : "締め切るまで"}　／　回答{" "}
          <b className="text-slate-900">{responders.length}</b> / {people.length}人
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SurveyControls surveyId={id} status={survey.status} targetCount={people.length} />
          <Link
            href={`${base}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            編集
          </Link>
          <Link
            href={`/admin/training-surveys/new?copy=${id}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            複製して新しく作る
          </Link>
        </div>
      </header>

      <div role="tablist" className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            role="tab"
            aria-selected={tab === key}
            href={`${base}?tab=${key}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "summary" &&
        (responders.length === 0 ? (
          <Empty text="まだ回答がありません。" />
        ) : (
          <div className="flex flex-col gap-4">
            {summaries.map((s, i) => (
              <SummaryCard key={s.questionId} n={i + 1} s={s} total={responders.length} />
            ))}
          </div>
        ))}

      {tab === "people" &&
        (responders.length === 0 ? (
          <Empty text="まだ回答がありません。" />
        ) : (
          <PeopleView
            base={base}
            questions={questions}
            people={responders.map((p) => {
              const r = responseOf.get(p.id)!;
              return {
                id: p.id,
                name: nameOf(p),
                office: p.office?.name ?? "",
                answers: r.answers as Answers,
                submittedAt: dateTime.format(r.updatedAt),
              };
            })}
            selectedId={sp.person}
          />
        ))}

      {tab === "pending" &&
        (pendingPeople.length === 0 ? (
          <Empty
            text={people.length === 0 ? "配る相手が選ばれていません。" : "全員が回答しました。"}
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendingPeople.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="font-semibold text-slate-900">{nameOf(p)}</p>
                <p className="text-xs text-slate-500">{p.office?.name ?? "拠点なし"}</p>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">{text}</p>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(6rem,12rem)_1fr_4.5rem] items-center gap-3 text-sm">
      <span className="truncate text-slate-700">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right text-slate-700 tabular-nums">
        {count}人 <span className="text-xs text-slate-400">{pct}%</span>
      </span>
    </div>
  );
}

function SummaryCard({ n, s, total }: { n: number; s: QuestionSummary; total: number }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold text-slate-900">
        <span className="mr-2 text-slate-400">Q{n}</span>
        {s.label}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">{s.answered}人が回答</p>
      <div className="mt-3">
        {s.kind === "RATING_5" && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="shrink-0 text-center sm:w-32">
              <p className="text-4xl font-bold text-slate-900 tabular-nums">{s.average ?? "—"}</p>
              <p className="text-xs text-slate-500">平均（5点満点）</p>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {[5, 4, 3, 2, 1].map((v) => (
                <Bar
                  key={v}
                  label={`${v}${v === 5 && s.highLabel ? `（${s.highLabel}）` : v === 1 && s.lowLabel ? `（${s.lowLabel}）` : ""}`}
                  count={s.counts[v - 1]!}
                  total={s.answered}
                />
              ))}
            </div>
          </div>
        )}
        {(s.kind === "SINGLE_CHOICE" || s.kind === "MULTI_CHOICE") && (
          <div className="flex flex-col gap-1.5">
            {s.counts.map((c) => (
              <Bar
                key={c.option}
                label={c.option}
                count={c.count}
                total={s.kind === "MULTI_CHOICE" ? total : s.answered}
              />
            ))}
          </div>
        )}
        {s.kind === "TEXT" &&
          (s.texts.length === 0 ? (
            <p className="text-sm text-slate-500">記入はありません。</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {s.texts.map((t, i) => (
                <li key={i} className="py-2.5">
                  <p className="text-xs font-semibold text-slate-500">{t.employeeName}</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-900">{t.text}</p>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}

function PeopleView({
  base,
  questions,
  people,
  selectedId,
}: {
  base: string;
  questions: SurveyQuestion[];
  people: ReadonlyArray<{
    id: string;
    name: string;
    office: string;
    answers: Answers;
    submittedAt: string;
  }>;
  selectedId: string | undefined;
}) {
  const idx = Math.max(
    0,
    people.findIndex((p) => p.id === selectedId),
  );
  const person = people[idx]!;
  const prev = people[idx - 1];
  const next = people[idx + 1];
  const link = (id: string) => `${base}?tab=people&person=${id}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <ul className="flex max-h-[70vh] flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {people.map((p) => (
          <li key={p.id}>
            <Link
              href={link(p.id)}
              aria-current={p.id === person.id ? "true" : undefined}
              className={`block border-b border-slate-100 px-4 py-2.5 text-sm ${
                p.id === person.id ? "bg-slate-900 font-semibold text-white" : "hover:bg-slate-50"
              }`}
            >
              {p.name}
              <span
                className={`block text-xs ${p.id === person.id ? "text-slate-300" : "text-slate-500"}`}
              >
                {p.office}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">{person.name}</h2>
          <span className="text-sm text-slate-500">
            {person.office}　{person.submittedAt} 回答
          </span>
          <span className="ml-auto flex gap-2">
            {prev ? (
              <Link
                href={link(prev.id)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                ← 前の人
              </Link>
            ) : null}
            {next ? (
              <Link
                href={link(next.id)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                次の人 →
              </Link>
            ) : null}
          </span>
        </header>
        <dl className="flex flex-col divide-y divide-slate-100">
          {questions.map((q, i) => {
            const v = person.answers[q.id];
            return (
              <div key={q.id} className="py-3">
                <dt className="text-sm text-slate-500">
                  <span className="mr-2 text-slate-400">Q{i + 1}</span>
                  {q.label}
                </dt>
                <dd className="mt-1 text-base font-semibold whitespace-pre-wrap text-slate-900">
                  {q.kind === "RATING_5" && typeof v === "number" ? (
                    <span className="flex items-center gap-1" aria-label={`${v} / 5`}>
                      {[1, 2, 3, 4, 5].map((k) => (
                        <span
                          key={k}
                          className={`flex size-7 items-center justify-center rounded-md text-sm ${
                            k <= v ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {k}
                        </span>
                      ))}
                    </span>
                  ) : (
                    formatAnswer(q, v)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </article>
    </div>
  );
}
