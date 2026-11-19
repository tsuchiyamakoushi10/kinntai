/**
 * 職員カルテ・面談記録・一次考課の画面本体。
 * 部署の管理者 (/me/team/[id]/...) と社長 (/admin/growth/staff/[id]/...) で同じものを使う。
 * 権限はページ側で checkStaffAccess 済みの前提 (Action 側でも再確認する)。
 */
import type { EvaluationPeriod, UserRole } from "@prisma/client";
import Link from "next/link";

import {
  deleteAssessment,
  deleteInterviewRecord,
  deleteSheet,
  deleteStepHistory,
  reopenSheet,
  saveAssessment,
  saveExpectation,
  saveInterviewRecord,
  saveStepHistory,
} from "@/lib/growth/actions";
import { staffBasePath } from "@/lib/growth/access";
import {
  EXPECTED_ROLE_OPTIONS,
  HR_ITEMS,
  INTERVIEW_STATUS_LABELS,
  SHEET_FIELDS,
  STEP_A_STANDARDS,
  STEP_LABELS,
} from "@/lib/growth/constants";
import { canEditAssessment, nextStep, NEXT_STEP_LABELS } from "@/lib/growth/logic";
import { employeeName, loadStaffPeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";
import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";
import { formatDate, toDateInputValue } from "@/lib/format";

import { ActionButton, GrowthForm } from "./growth-form";
import {
  Card,
  CheckboxGroup,
  inputClass,
  PeriodTabs,
  primaryButton,
  RankBadge,
  RankRadios,
  secondaryButton,
  StatusPill,
  StepBadge,
  StepIndicator,
  StepSelect,
  TextArea,
} from "./ui";

type ScreenProps = {
  employeeId: string;
  role: UserRole;
  periods: EvaluationPeriod[];
  period: EvaluationPeriod;
};

export type StaffTab = "chart" | "interview" | "assessment" | "final" | "review";

async function loadHeader(employeeId: string) {
  return prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      jobCategory: true,
      employmentType: true,
      joinedAt: true,
      office: { select: { name: true } },
      growthProfile: {
        select: {
          growthStep: true,
          manager: { select: { lastName: true, firstName: true } },
        },
      },
    },
  });
}

/** 職員名・基本情報と、カルテ / 面談記録 / 一次考課 (/ 最終考課 / 面談確認) の切り替え */
export async function StaffHeader({
  employeeId,
  role,
  periods,
  period,
  tab,
}: ScreenProps & { tab: StaffTab }) {
  const e = await loadHeader(employeeId);
  const base = staffBasePath(role, employeeId);
  const q = `?period=${period.id}`;
  const tabs: { key: StaffTab; label: string; href: string }[] = [
    { key: "chart", label: "カルテ", href: `${base}${q}` },
    { key: "interview", label: "面談記録", href: `${base}/interview${q}` },
    { key: "assessment", label: "一次考課", href: `${base}/assessment${q}` },
    ...(role === "ADMIN"
      ? [
          { key: "final" as const, label: "最終考課", href: `${base}/final${q}` },
          { key: "review" as const, label: "面談確認・処遇", href: `${base}/review${q}` },
        ]
      : []),
  ];
  const tabPath = tab === "chart" ? "" : `/${tab}`;
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={
          role === "ADMIN" ? `/admin/growth?period=${period.id}` : `/me/team?period=${period.id}`
        }
        className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      >
        ← 一覧へ
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{employeeName(e)} さん</h1>
          <p className="mt-1 text-sm text-slate-600">
            {[
              e.office?.name,
              e.jobCategory ? JOB_CATEGORY_LABELS[e.jobCategory] : null,
              e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : null,
              e.joinedAt ? `入社 ${formatDate(e.joinedAt)}` : null,
            ]
              .filter(Boolean)
              .join("　/　")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            担当:{" "}
            {e.growthProfile?.manager
              ? employeeName(e.growthProfile.manager)
              : "なし（社長が直接）"}
          </p>
        </div>
        <StepBadge step={e.growthProfile?.growthStep} />
      </div>
      <PeriodTabs
        periods={periods}
        currentId={period.id}
        hrefFor={(id) => `${base}${tabPath}?period=${id}`}
      />
      <nav aria-label="記録の種類" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-base font-semibold ${
              t.key === tab
                ? "border-pink-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// カルテ
// ---------------------------------------------------------------------------

export async function StaffChartScreen({ employeeId, role, periods, period }: ScreenProps) {
  const [profile, histories, data, allExpectations] = await Promise.all([
    prisma.growthProfile.findUnique({ where: { employeeId } }),
    prisma.growthStepHistory.findMany({
      where: { employeeId },
      orderBy: [{ changedOn: "desc" }, { createdAt: "desc" }],
    }),
    loadStaffPeriod(employeeId, period.id),
    prisma.growthExpectation.findMany({ where: { employeeId }, select: { periodId: true } }),
  ]);
  const base = staffBasePath(role, employeeId);
  const today = toDateInputValue(new Date());
  const step = profile?.growthStep ?? null;

  // 期ごとの履歴 (面談・考課の結果)
  const [records, finals] = await Promise.all([
    prisma.interviewRecord.findMany({
      where: { employeeId },
      select: { periodId: true, status: true },
    }),
    prisma.hrFinalAssessment.findMany({
      where: { employeeId },
      select: { periodId: true, status: true, overallRank: true },
    }),
  ]);
  const recordBy = new Map(records.map((r) => [r.periodId, r]));
  const finalBy = new Map(finals.map((r) => [r.periodId, r]));
  const expectationSet = new Set(allExpectations.map((x) => x.periodId));

  const progress = nextStep({
    sheetSubmitted: !!data.sheet?.submittedAt,
    recordStatus: data.record?.status ?? null,
    assessmentStatus: data.assessment?.status ?? null,
    finalStatus: data.final?.status ?? null,
    reviewStatus: data.review?.status ?? null,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="成長の段階 (STEP)">
        <StepIndicator step={step} />
        {step && <p className="mt-3 text-sm text-slate-600">{STEP_LABELS[step].description}</p>}

        <h3 className="mt-5 text-sm font-bold text-slate-700">STEP を記録する</h3>
        <GrowthForm action={saveStepHistory} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="employeeId" value={employeeId} />
          <StepSelect name="step" defaultValue={step} allowEmpty={false} />
          <input type="date" name="changedOn" defaultValue={today} className={inputClass} />
          <input
            name="note"
            placeholder="メモ（なくても可）"
            className={`${inputClass} sm:col-span-2`}
          />
          <button type="submit" className={`${primaryButton} sm:col-span-2`}>
            記録する
          </button>
        </GrowthForm>

        <h3 className="mt-5 text-sm font-bold text-slate-700">これまでの STEP</h3>
        {histories.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {histories.map((h) => (
              <li key={h.id} className="rounded-lg border border-slate-200 p-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                    <span className="text-slate-600 tabular-nums">{formatDate(h.changedOn)}</span>
                    <StepBadge step={h.step} />
                    {h.note && <span className="text-slate-600">{h.note}</span>}
                    <span className="ml-auto text-xs text-pink-600 underline">直す</span>
                  </summary>
                  <GrowthForm action={saveStepHistory} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="employeeId" value={employeeId} />
                    <input type="hidden" name="historyId" value={h.id} />
                    <StepSelect name="step" defaultValue={h.step} allowEmpty={false} />
                    <input
                      type="date"
                      name="changedOn"
                      defaultValue={toDateInputValue(h.changedOn)}
                      className={inputClass}
                    />
                    <input
                      name="note"
                      defaultValue={h.note ?? ""}
                      placeholder="メモ"
                      className={`${inputClass} sm:col-span-2`}
                    />
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <button type="submit" className={secondaryButton}>
                        直す
                      </button>
                      <ActionButton
                        action={deleteStepHistory.bind(null, employeeId, h.id)}
                        label="この記録を消す"
                        variant="danger"
                        confirm="この STEP の記録を消します。よろしいですか？"
                      />
                    </div>
                  </GrowthForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-5">
        <Card title={`${period.name} の状況`}>
          <p className="mb-3 text-sm">
            次にやること: <span className="font-bold">{NEXT_STEP_LABELS[progress]}</span>
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span>面談シート（本人）</span>
              {data.sheet?.submittedAt ? (
                <StatusPill tone="done">提出済み</StatusPill>
              ) : data.sheet ? (
                <StatusPill tone="doing">書きかけ</StatusPill>
              ) : (
                <StatusPill tone="todo">まだ</StatusPill>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <Link
                href={`${base}/interview?period=${period.id}`}
                className="text-pink-700 underline"
              >
                面談記録
              </Link>
              <StatusPill
                tone={data.record?.status === "DONE" ? "done" : data.record ? "doing" : "todo"}
              >
                {data.record ? INTERVIEW_STATUS_LABELS[data.record.status] : "まだ"}
              </StatusPill>
            </li>
            <li className="flex items-center justify-between gap-2">
              <Link
                href={`${base}/assessment?period=${period.id}`}
                className="text-pink-700 underline"
              >
                一次考課
              </Link>
              <StatusPill
                tone={
                  data.assessment?.status === "SUBMITTED"
                    ? "done"
                    : data.assessment
                      ? "doing"
                      : "todo"
                }
              >
                {data.assessment?.status === "SUBMITTED"
                  ? "提出済み"
                  : data.assessment
                    ? "下書き"
                    : "まだ"}
              </StatusPill>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>最終考課（社長）</span>
              <span className="flex items-center gap-2">
                {data.final?.status === "CONFIRMED" && role === "ADMIN" && (
                  <RankBadge rank={data.final.overallRank} />
                )}
                <StatusPill tone={data.final?.status === "CONFIRMED" ? "done" : "todo"}>
                  {data.final?.status === "CONFIRMED" ? "確定" : "まだ"}
                </StatusPill>
              </span>
            </li>
          </ul>
        </Card>

        <Card title={`今期の期待目標（${period.name}）`}>
          <GrowthForm action={saveExpectation}>
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="periodId" value={period.id} />
            <TextArea
              name="content"
              label="本人に期待すること・目標"
              hint="本人の画面にも表示されます。空にして保存すると消えます。"
              defaultValue={data.expectation?.content}
              rows={4}
            />
            <button type="submit" className={primaryButton}>
              保存する
            </button>
          </GrowthForm>
        </Card>

        <Card title="これまでの面談・考課">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">期間</th>
                <th className="py-1">期待目標</th>
                <th className="py-1">面談記録</th>
                {role === "ADMIN" && <th className="py-1">総合評価</th>}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const r = recordBy.get(p.id);
                const f = finalBy.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <Link href={`${base}?period=${p.id}`} className="text-pink-700 underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2">{expectationSet.has(p.id) ? "あり" : "—"}</td>
                    <td className="py-2">{r ? INTERVIEW_STATUS_LABELS[r.status] : "—"}</td>
                    {role === "ADMIN" && (
                      <td className="py-2">
                        {f?.status === "CONFIRMED" ? <RankBadge rank={f.overallRank} /> : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 面談記録
// ---------------------------------------------------------------------------

export async function InterviewRecordScreen({ employeeId, period }: ScreenProps) {
  const [{ sheet, record }, profile] = await Promise.all([
    loadStaffPeriod(employeeId, period.id),
    prisma.growthProfile.findUnique({ where: { employeeId }, select: { growthStep: true } }),
  ]);
  const del = deleteInterviewRecord.bind(null, employeeId, period.id);

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
      <Card
        title="本人の面談シート"
        actions={
          sheet && (
            <span className="flex flex-wrap gap-2">
              {sheet.submittedAt && (
                <ActionButton
                  action={reopenSheet.bind(null, employeeId, period.id)}
                  label="書きかけに戻す"
                  confirm="本人がもう一度直せるように、面談シートを書きかけに戻します。よろしいですか？"
                />
              )}
              <ActionButton
                action={deleteSheet.bind(null, employeeId, period.id)}
                label="消す"
                variant="danger"
                confirm="本人の面談シートを消します。元に戻せません。よろしいですか？"
              />
            </span>
          )
        }
      >
        {!sheet ? (
          <p className="text-sm text-slate-500">まだ書かれていません。</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              {sheet.submittedAt
                ? `提出 ${formatDate(sheet.submittedAt)}`
                : "書きかけ（まだ提出されていません）"}
            </p>
            {SHEET_FIELDS.map((f) => (
              <div key={f.key}>
                <p className="text-sm font-semibold text-slate-700">{f.label}</p>
                <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800">
                  {sheet[f.key] || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="面談記録"
        actions={
          record && (
            <ActionButton
              action={del}
              label="この記録を消す"
              variant="danger"
              confirm="面談記録を消します。元に戻せません。よろしいですか？"
            />
          )
        }
      >
        {record && (
          <p className="mb-3 text-xs text-slate-500">
            状態: {INTERVIEW_STATUS_LABELS[record.status]}
            {record.interviewer?.employee &&
              ` ／ 記録した人: ${employeeName(record.interviewer.employee)}`}
          </p>
        )}
        <GrowthForm action={saveInterviewRecord}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="periodId" value={period.id} />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">面談日</span>
            <input
              type="date"
              name="interviewedOn"
              defaultValue={toDateInputValue(record?.interviewedOn)}
              className={`${inputClass} sm:w-56`}
            />
          </label>
          <TextArea name="strength" label="強み・よかったところ" defaultValue={record?.strength} />
          <TextArea name="issue" label="課題" defaultValue={record?.issue} />
          <TextArea name="expectation" label="期待すること" defaultValue={record?.expectation} />
          <TextArea name="followUp" label="フォローすること" defaultValue={record?.followUp} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">今後期待する役割</span>
            <CheckboxGroup
              name="expectedRoles"
              options={EXPECTED_ROLE_OPTIONS}
              defaultValues={record?.expectedRoles ?? []}
            />
          </div>
          <TextArea
            name="supportPlan"
            label="会社・管理者が支援すること"
            defaultValue={record?.supportPlan}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-700">いまの STEP</span>
              <StepSelect
                name="currentStep"
                defaultValue={record ? record.currentStep : profile?.growthStep}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-700">次にめざす STEP</span>
              <StepSelect name="nextStep" defaultValue={record?.nextStep} />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            ※ ここで選んだ STEP は記録用です。本人の STEP
            を変えるときは「カルテ」で記録してください。
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="intent" value="save" className={secondaryButton}>
              途中で保存
            </button>
            <button type="submit" name="intent" value="done" className={primaryButton}>
              面談を完了にする
            </button>
          </div>
        </GrowthForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 一次考課
// ---------------------------------------------------------------------------

export async function AssessmentScreen({ employeeId, period }: ScreenProps) {
  const [{ assessment, final }, profile] = await Promise.all([
    loadStaffPeriod(employeeId, period.id),
    prisma.growthProfile.findUnique({ where: { employeeId }, select: { growthStep: true } }),
  ]);
  const step = profile?.growthStep ?? null;
  const editable = canEditAssessment(final?.status);

  return (
    <div className="flex flex-col gap-5">
      {!editable && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          社長の最終考課が確定しているため、直せません。直すときは社長に確定を取り消してもらってください。
        </p>
      )}
      <Card
        title="一次考課"
        actions={
          assessment &&
          editable && (
            <ActionButton
              action={deleteAssessment.bind(null, employeeId, period.id)}
              label="この考課を消す"
              variant="danger"
              confirm="一次考課を消します。元に戻せません。よろしいですか？"
            />
          )
        }
      >
        <p className="mb-4 text-sm text-slate-600">
          {assessment
            ? `状態: ${assessment.status === "SUBMITTED" ? "社長へ提出済み" : "下書き"}${
                assessment.assessor?.employee
                  ? ` ／ 付けた人: ${employeeName(assessment.assessor.employee)}`
                  : ""
              }`
            : "まだ付けていません。"}
          {step
            ? ` ／ 目安は ${STEP_LABELS[step].short}（${STEP_LABELS[step].title}）の A 評価です。`
            : " ／ STEP が未設定のため目安を出せません（カルテで記録できます）。"}
        </p>
        <GrowthForm action={saveAssessment}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="periodId" value={period.id} />
          {HR_ITEMS.map((item) => (
            <fieldset
              key={item.key}
              className="rounded-xl border border-slate-200 p-4"
              disabled={!editable}
            >
              <legend className="px-1 text-base font-bold text-slate-900">{item.label}</legend>
              {step && (
                <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  A の目安: {STEP_A_STANDARDS[step][item.key]}
                </p>
              )}
              <RankRadios name={item.key} defaultValue={assessment?.[item.key]} />
              <div className="mt-3">
                <TextArea
                  name={`${item.key}Evidence`}
                  label="根拠（実際の行動・できごと）"
                  defaultValue={assessment?.[`${item.key}Evidence`]}
                  rows={2}
                />
              </div>
            </fieldset>
          ))}
          <TextArea
            name="overallComment"
            label="総評"
            defaultValue={assessment?.overallComment}
            rows={4}
          />
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="draft" className={secondaryButton}>
                下書き保存
              </button>
              <button
                type="submit"
                name="intent"
                value="submit"
                className={primaryButton}
                data-confirm="社長へ提出します。提出後も、社長が確定するまでは直せます。"
              >
                社長へ提出する
              </button>
            </div>
          )}
        </GrowthForm>
      </Card>
    </div>
  );
}
