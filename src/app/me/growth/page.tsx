import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GrowthForm } from "@/components/growth/growth-form";
import {
  Card,
  PeriodTabs,
  primaryButton,
  secondaryButton,
  StepIndicator,
  TextArea,
} from "@/components/growth/ui";
import { saveMySheet } from "@/lib/growth/actions";
import { SHEET_FIELDS, STEP_LABELS } from "@/lib/growth/constants";
import { canEditSheet } from "@/lib/growth/logic";
import { listPeriods, loadStaffPeriod, resolvePeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ period?: string }> };

/** S-E-14 わたしの成長・面談シート (職員) */
export default async function MyGrowthPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;
  const sp = await searchParams;

  const periods = await listPeriods();
  const period = resolvePeriod(periods, sp.period);
  const profile = employeeId
    ? await prisma.growthProfile.findUnique({ where: { employeeId }, select: { growthStep: true } })
    : null;
  const data = employeeId && period ? await loadStaffPeriod(employeeId, period.id) : null;
  const step = profile?.growthStep ?? null;
  const editable = canEditSheet(data?.record?.status);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
      <header className="flex items-center gap-3">
        <Link
          href="/me"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          ← 戻る
        </Link>
        <h1 className="text-lg font-bold text-slate-900">わたしの成長・面談シート</h1>
      </header>

      {!employeeId ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          このアカウントには従業員情報が紐づいていません。管理者にお問い合わせください。
        </p>
      ) : (
        <>
          <Card title="いまの段階">
            <StepIndicator step={step} />
            <p className="mt-3 text-sm text-slate-700">
              {step
                ? `${STEP_LABELS[step].short}「${STEP_LABELS[step].title}」— ${STEP_LABELS[step].description}`
                : "まだ決まっていません。面談のあとに担当者が記録します。"}
            </p>
          </Card>

          {!period ? (
            <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
              面談の期間がまだ始まっていません。
            </p>
          ) : (
            <>
              <PeriodTabs
                periods={periods}
                currentId={period.id}
                hrefFor={(id) => `/me/growth?period=${id}`}
              />
              <Card title={`今期の期待目標（${period.name}）`}>
                <p className="text-base whitespace-pre-wrap text-slate-800">
                  {data?.expectation?.content || "まだ書かれていません。"}
                </p>
              </Card>

              <Card title={`面談シート（${period.name}）`}>
                <p className="mb-4 text-sm text-slate-600">
                  {data?.sheet?.submittedAt
                    ? `${formatDate(data.sheet.submittedAt)} に出しました。${
                        editable ? "面談が終わるまでは直して出し直せます。" : ""
                      }`
                    : "思ったことをそのまま書いてください。途中で保存もできます。"}
                </p>
                {!editable && (
                  <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    面談が終わったため、もう直せません。
                  </p>
                )}
                <GrowthForm action={saveMySheet}>
                  <input type="hidden" name="periodId" value={period.id} />
                  {SHEET_FIELDS.map((f) => (
                    <TextArea
                      key={f.key}
                      name={f.key}
                      label={f.label}
                      defaultValue={data?.sheet?.[f.key]}
                      rows={4}
                      readOnly={!editable}
                    />
                  ))}
                  {editable && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button type="submit" name="intent" value="save" className={secondaryButton}>
                        途中で保存
                      </button>
                      <button type="submit" name="intent" value="submit" className={primaryButton}>
                        {data?.sheet?.submittedAt ? "出し直す" : "出す"}
                      </button>
                    </div>
                  )}
                </GrowthForm>
              </Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
