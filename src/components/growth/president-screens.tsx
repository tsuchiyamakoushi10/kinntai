/**
 * 社長だけの画面: 最終考課 (S-A-44) と 面談確認・処遇 (S-A-45)。docs/growth-review.md §3, §6
 */
import type { EvalRank } from "@prisma/client";

import {
  deleteFinalAssessment,
  deleteGrowthReview,
  saveFinalAssessment,
  saveGrowthReview,
} from "@/lib/growth/actions";
import {
  BONUS_REASON_OPTIONS,
  DEVELOPMENT_RANK_OPTIONS,
  EXPECTATION_LEVEL_OPTIONS,
  EXPECTED_ROLE_OPTIONS,
  HR_ITEMS,
  INTERVIEW_STATUS_LABELS,
  NEXT_ASSIGNMENT_OPTIONS,
  SALARY_REASON_OPTIONS,
  SHEET_FIELDS,
  STEP_LABELS,
  TALENT_POTENTIAL_OPTIONS,
} from "@/lib/growth/constants";
import { defaultPrevCompensation } from "@/lib/growth/logic";
import { employeeName, loadStaffPeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";
import { formatDate, formatYen } from "@/lib/format";

import { ActionButton, GrowthForm } from "./growth-form";
import type { StaffScreenProps } from "./staff-page";
import {
  Card,
  CheckboxGroup,
  inputClass,
  OptionSelect,
  primaryButton,
  RankBadge,
  RankRadios,
  secondaryButton,
  TextArea,
} from "./ui";

function ConfirmedNote({ at, label }: { at: Date | null; label: string }) {
  return (
    <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
      {label}は {at ? formatDate(at) : ""}{" "}
      に確定しています。直すときは「確定を取り消す」を押してください。
    </p>
  );
}

// ---------------------------------------------------------------------------
// 最終考課
// ---------------------------------------------------------------------------

export async function FinalAssessmentScreen({ employeeId, period }: StaffScreenProps) {
  const { assessment, final } = await loadStaffPeriod(employeeId, period.id);
  const confirmed = final?.status === "CONFIRMED";
  // 最終評価の初期値は一次考課 (まだ最終考課が無いとき)
  const initial = (key: (typeof HR_ITEMS)[number]["key"]): EvalRank | null =>
    final ? final[key] : (assessment?.[key] ?? null);

  return (
    <div className="flex flex-col gap-5">
      {confirmed && <ConfirmedNote at={final.confirmedAt} label="最終考課" />}
      {!assessment ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          一次考課がまだありません。一次考課なしで最終考課を付けることもできます。
        </p>
      ) : (
        assessment.status !== "SUBMITTED" && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            一次考課はまだ下書きです（担当者が社長へ提出していません）。
          </p>
        )
      )}

      <Card
        title="最終考課"
        actions={
          final && (
            <span className="flex flex-wrap gap-2">
              {confirmed && (
                <GrowthForm action={saveFinalAssessment} className="contents">
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="periodId" value={period.id} />
                  <button
                    type="submit"
                    name="intent"
                    value="reopen"
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  >
                    確定を取り消す
                  </button>
                </GrowthForm>
              )}
              <ActionButton
                action={deleteFinalAssessment.bind(null, employeeId, period.id)}
                label="この考課を消す"
                variant="danger"
                confirm="最終考課を消します。元に戻せません。よろしいですか？"
              />
            </span>
          )
        }
      >
        <GrowthForm action={saveFinalAssessment}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="periodId" value={period.id} />
          {HR_ITEMS.map((item) => (
            <fieldset
              key={item.key}
              disabled={confirmed}
              className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_auto]"
            >
              <legend className="px-1 text-base font-bold text-slate-900">{item.label}</legend>
              <div className="text-sm">
                <p className="flex items-center gap-2 text-slate-600">
                  一次考課: <RankBadge rank={assessment?.[item.key]} />
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">
                  {assessment?.[`${item.key}Evidence` as const] || "（根拠の記入なし）"}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">最終評価</p>
                <RankRadios name={item.key} defaultValue={initial(item.key)} />
              </div>
            </fieldset>
          ))}
          {assessment?.overallComment && (
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-700">担当者の総評</p>
              <p className="mt-1 whitespace-pre-wrap">{assessment.overallComment}</p>
            </div>
          )}
          <fieldset disabled={confirmed} className="flex flex-col gap-4">
            <TextArea
              name="changeReason"
              label="一次考課から変えた理由"
              hint="一次考課と違う評価にした項目があるときは必ず書いてください。"
              defaultValue={final?.changeReason}
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-700">総合評価</span>
              <RankRadios name="overallRank" defaultValue={final?.overallRank} />
            </div>
            <TextArea name="comment" label="社長コメント" defaultValue={final?.comment} rows={4} />
          </fieldset>
          {!confirmed && (
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="draft" className={secondaryButton}>
                下書き保存
              </button>
              <button type="submit" name="intent" value="confirm" className={primaryButton}>
                最終考課を確定する
              </button>
            </div>
          )}
        </GrowthForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 面談確認・処遇
// ---------------------------------------------------------------------------

export async function GrowthReviewScreen({ employeeId, period, periods }: StaffScreenProps) {
  const [{ sheet, record, final, review }, employee] = await Promise.all([
    loadStaffPeriod(employeeId, period.id),
    prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { baseWageType: true, baseWageAmount: true },
    }),
  ]);
  const confirmed = review?.status === "CONFIRMED";

  // 前期の初期値: この期間より前の、いちばん近い期間の面談確認
  const earlierIds = periods.filter((p) => p.startOn < period.startOn).map((p) => p.id);
  const prevReview =
    !review && earlierIds.length > 0
      ? await prisma.growthReview.findFirst({
          where: { employeeId, periodId: { in: earlierIds } },
          orderBy: { period: { startOn: "desc" } },
          select: { currentBaseSalary: true, currentBonus: true },
        })
      : null;
  const prevDefaults = review
    ? { prevBaseSalary: review.prevBaseSalary, prevBonus: review.prevBonus }
    : defaultPrevCompensation(prevReview, employee);
  const yenValue = (n: number | null | undefined) =>
    n === null || n === undefined ? "" : String(n);

  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-5">
        <Card title="面談記録（担当者）">
          {!record ? (
            <p className="text-sm text-slate-500">まだありません。</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              <p className="text-xs text-slate-500">
                {INTERVIEW_STATUS_LABELS[record.status]}
                {record.interviewedOn && ` ／ 面談日 ${formatDate(record.interviewedOn)}`}
                {record.interviewer?.employee && ` ／ ${employeeName(record.interviewer.employee)}`}
              </p>
              {(
                [
                  ["強み", record.strength],
                  ["課題", record.issue],
                  ["期待すること", record.expectation],
                  ["フォロー", record.followUp],
                  ["支援すること", record.supportPlan],
                  ["期待する役割", record.expectedRoles.join("、")],
                  [
                    "STEP",
                    [record.currentStep, record.nextStep]
                      .map((s) => (s ? STEP_LABELS[s].short : "—"))
                      .join(" → "),
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-semibold text-slate-700">{k}</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
        <Card title="本人の面談シート">
          {!sheet ? (
            <p className="text-sm text-slate-500">まだありません。</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {SHEET_FIELDS.map((f) => (
                <div key={f.key}>
                  <dt className="font-semibold text-slate-700">{f.label}</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{sheet[f.key] || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
        <Card title="最終考課">
          {final ? (
            <p className="flex items-center gap-2 text-sm">
              総合評価 <RankBadge rank={final.overallRank} />
              {final.status === "CONFIRMED" ? "（確定）" : "（下書き）"}
            </p>
          ) : (
            <p className="text-sm text-slate-500">まだありません。</p>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-5">
        {confirmed && <ConfirmedNote at={review.confirmedAt} label="面談確認" />}
        <Card
          title="面談確認・育成方針・処遇"
          actions={
            review && (
              <span className="flex flex-wrap gap-2">
                {confirmed && (
                  <GrowthForm action={saveGrowthReview} className="contents">
                    <input type="hidden" name="employeeId" value={employeeId} />
                    <input type="hidden" name="periodId" value={period.id} />
                    <button
                      type="submit"
                      name="intent"
                      value="reopen"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    >
                      確定を取り消す
                    </button>
                  </GrowthForm>
                )}
                <ActionButton
                  action={deleteGrowthReview.bind(null, employeeId, period.id)}
                  label="この記録を消す"
                  variant="danger"
                  confirm="面談確認・処遇の記録を消します。元に戻せません。よろしいですか？"
                />
              </span>
            )
          }
        >
          <GrowthForm action={saveGrowthReview}>
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="periodId" value={period.id} />
            <fieldset disabled={confirmed} className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-500">面談の確認</h3>
              <TextArea
                name="presidentMemo"
                label="社長メモ"
                defaultValue={review?.presidentMemo}
              />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  name="needsFollowUp"
                  defaultChecked={review?.needsFollowUp}
                />
                フォローが必要
              </label>
              <TextArea
                name="followUpReason"
                label="フォローが必要な理由"
                defaultValue={review?.followUpReason}
                rows={2}
              />

              <h3 className="mt-2 text-sm font-bold text-slate-500">人材育成の判断</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700">期待度</span>
                  <OptionSelect
                    name="expectationLevel"
                    options={EXPECTATION_LEVEL_OPTIONS}
                    defaultValue={review?.expectationLevel ?? null}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700">育成区分</span>
                  <OptionSelect
                    name="developmentRank"
                    options={DEVELOPMENT_RANK_OPTIONS}
                    defaultValue={review?.developmentRank ?? null}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700">人材ポテンシャル</span>
                  <OptionSelect
                    name="talentPotential"
                    options={TALENT_POTENTIAL_OPTIONS}
                    defaultValue={review?.talentPotential ?? null}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-700">将来任せたい役割</span>
                <input
                  name="futureRole"
                  defaultValue={review?.futureRole ?? ""}
                  list="future-role-options"
                  className={inputClass}
                />
                <datalist id="future-role-options">
                  {EXPECTED_ROLE_OPTIONS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
              <TextArea
                name="lackingSkills"
                label="足りない力"
                defaultValue={review?.lackingSkills}
                rows={2}
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-700">次に任せたいこと</span>
                <CheckboxGroup
                  name="nextAssignmentTags"
                  options={NEXT_ASSIGNMENT_OPTIONS}
                  defaultValues={review?.nextAssignmentTags ?? []}
                />
              </div>
              <TextArea
                name="nextAssignments"
                label="次に任せたいこと（くわしく）"
                defaultValue={review?.nextAssignments}
                rows={2}
              />
              <TextArea
                name="developmentPolicy"
                label="育成方針"
                defaultValue={review?.developmentPolicy}
              />

              <h3 className="mt-2 text-sm font-bold text-slate-500">処遇（昇給・賞与）の判断</h3>
              <p className="-mt-2 text-xs text-slate-500">
                前期の金額は前の期間の記録（なければ従業員の基本給）から入れています。実際の昇給は「昇給通知」で行います。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["prevBaseSalary", "前期の基本給（月額）", prevDefaults.prevBaseSalary],
                    ["currentBaseSalary", "今期の基本給（月額）", review?.currentBaseSalary],
                    ["prevBonus", "前期の賞与", prevDefaults.prevBonus],
                    ["currentBonus", "今期の賞与", review?.currentBonus],
                  ] as const
                ).map(([name, label, value]) => (
                  <label key={name} className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                    <input
                      name={name}
                      inputMode="numeric"
                      defaultValue={yenValue(value)}
                      placeholder="例 230000"
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
              {review?.prevBaseSalary != null && review.currentBaseSalary != null && (
                <p className="text-sm text-slate-700">
                  基本給の差: {formatYen(review.currentBaseSalary - review.prevBaseSalary)}
                </p>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-700">昇給の理由</span>
                <CheckboxGroup
                  name="salaryReasons"
                  options={SALARY_REASON_OPTIONS}
                  defaultValues={review?.salaryReasons ?? []}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-700">賞与の理由</span>
                <CheckboxGroup
                  name="bonusReasons"
                  options={BONUS_REASON_OPTIONS}
                  defaultValues={review?.bonusReasons ?? []}
                />
              </div>
              <TextArea
                name="compensationReason"
                label="処遇の判断理由"
                defaultValue={review?.compensationReason}
              />
              <TextArea
                name="presidentMessage"
                label="本人への言葉"
                hint="いまは本人の画面には表示しません。"
                defaultValue={review?.presidentMessage}
              />
            </fieldset>
            {!confirmed && (
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="intent" value="draft" className={secondaryButton}>
                  下書き保存
                </button>
                <button type="submit" name="intent" value="confirm" className={primaryButton}>
                  確定する
                </button>
              </div>
            )}
          </GrowthForm>
        </Card>
      </div>
    </div>
  );
}
