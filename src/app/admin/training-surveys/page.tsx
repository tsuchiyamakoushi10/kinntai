import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { SURVEY_STATUS_CLASS, SURVEY_STATUS_LABEL } from "./labels";

export const dynamic = "force-dynamic";

/** S-A-35 研修アンケート 一覧 */
export default async function TrainingSurveyListPage() {
  await requireAdmin();
  const surveys = await prisma.trainingSurvey.findMany({
    orderBy: [{ trainedOn: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      office: { select: { name: true } },
      _count: { select: { targets: true, responses: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">研修アンケート</h1>
          <p className="mt-1 text-sm text-slate-500">
            研修のあとに職員のマイページへアンケートを配り、回答を見られます。
          </p>
        </div>
        <Link
          href="/admin/training-surveys/new"
          className="rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新しく作る
        </Link>
      </header>

      {surveys.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          まだアンケートがありません。「新しく作る」から作ってください。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {surveys.map((s) => {
            const rate =
              s._count.targets > 0 ? Math.round((s._count.responses / s._count.targets) * 100) : 0;
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/admin/training-surveys/${s.id}`}
                    className="text-base font-bold text-slate-900 hover:underline"
                  >
                    {s.title}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SURVEY_STATUS_CLASS[s.status]}`}
                  >
                    {SURVEY_STATUS_LABEL[s.status]}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <Link
                      href={`/admin/training-surveys/${s.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                    >
                      結果を見る
                    </Link>
                    <Link
                      href={`/admin/training-surveys/new?copy=${s.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      複製
                    </Link>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
                  <span>研修日 {formatDate(s.trainedOn)}</span>
                  {s.office && <span>{s.office.name}</span>}
                  <span>期限 {s.answerUntil ? formatDate(s.answerUntil) : "締め切るまで"}</span>
                  <span className="flex items-center gap-2">
                    回答 <b className="text-slate-900">{s._count.responses}</b> / {s._count.targets}
                    人
                    <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full bg-emerald-500" style={{ width: `${rate}%` }} />
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
