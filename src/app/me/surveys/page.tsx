import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatDate, toDateInputValue } from "@/lib/format";
import { canAnswer } from "@/lib/training-survey/logic";

export const dynamic = "force-dynamic";

/** S-E-11 アンケート一覧 (職員) */
export default async function MySurveysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;

  const surveys = employeeId
    ? await prisma.trainingSurvey.findMany({
        where: { status: { not: "DRAFT" }, targets: { some: { employeeId } } },
        orderBy: [{ trainedOn: "desc" }],
        take: 50,
        include: { responses: { where: { employeeId }, select: { id: true } } },
      })
    : [];
  const today = toDateInputValue(new Date());
  const rows = surveys.map((s) => ({
    s,
    answered: s.responses.length > 0,
    open: canAnswer(
      { status: s.status, answerUntil: s.answerUntil ? toDateInputValue(s.answerUntil) : null },
      today,
    ),
  }));
  const todo = rows.filter((r) => r.open && !r.answered);
  const rest = rows.filter((r) => !(r.open && !r.answered));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
      <header className="flex items-center gap-3">
        <Link
          href="/me"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          ← 戻る
        </Link>
        <h1 className="text-lg font-bold text-slate-900">研修アンケート</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-600">まだ答えていないもの</h2>
        {todo.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            ありません。
          </p>
        ) : (
          todo.map(({ s }) => (
            <Link
              key={s.id}
              href={`/me/surveys/${s.id}`}
              className="flex items-center justify-between rounded-2xl bg-amber-50 px-5 py-4 shadow-sm ring-2 ring-amber-300"
            >
              <span>
                <span className="block text-base font-bold text-slate-900">{s.title}</span>
                <span className="text-xs text-slate-600">
                  研修日 {formatDate(s.trainedOn)}
                  {s.answerUntil && `　${formatDate(s.answerUntil)}まで`}
                </span>
              </span>
              <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
                答える
              </span>
            </Link>
          ))
        )}
      </section>

      {rest.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-600">これまでのアンケート</h2>
          {rest.map(({ s, answered, open }) => (
            <Link
              key={s.id}
              href={`/me/surveys/${s.id}`}
              className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900">{s.title}</span>
                <span className="text-xs text-slate-500">研修日 {formatDate(s.trainedOn)}</span>
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {answered ? (open ? "回答済み（直せます）" : "回答済み") : "受付終了"}
              </span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
