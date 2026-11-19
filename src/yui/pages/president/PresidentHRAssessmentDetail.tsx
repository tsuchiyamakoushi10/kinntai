"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/yui/router";
import { ArrowLeft, Save, CheckCircle2, AlertCircle } from "lucide-react";
import {
  staffStore,
  hrAssessmentStore,
  presidentReviewStore,
  periodStore,
  uid,
} from "@/yui/storage";
import type {
  Staff,
  HRAssessment,
  PresidentReview,
  EvalRank,
  HRPresidentEvaluation,
} from "../../types";
import { GROWTH_STEP_OPTIONS, EVAL_RANKS } from "../../types";
import { HR_ITEMS, STEP_A_STANDARDS, type HRKey } from "../manager/HRAssessmentPage";
import PageHeader from "../../components/PageHeader";
import EvalBadge from "../../components/EvalBadge";

// ===== 型定義 =====

interface ItemForm {
  rank: EvalRank | null;
  reason: string;
}

interface PresidentFormState {
  items: Record<HRKey, ItemForm>;
  overallRank: EvalRank | null;
  overallComment: string;
}

const EMPTY_ITEM: ItemForm = { rank: null, reason: "" };

const EMPTY_FORM: PresidentFormState = {
  items: {
    userCenteredAction: { ...EMPTY_ITEM },
    respectfulInteraction: { ...EMPTY_ITEM },
    teamwork: { ...EMPTY_ITEM },
    initiativeImprovement: { ...EMPTY_ITEM },
    responsibility: { ...EMPTY_ITEM },
  },
  overallRank: null,
  overallComment: "",
};

const RANK_COLORS: Record<EvalRank, { selected: string; hover: string }> = {
  S: {
    selected: "bg-amber-500 text-white border-amber-500",
    hover: "border-cream-200 text-ink-500 hover:border-amber-300 hover:text-amber-600",
  },
  A: {
    selected: "bg-sage-600 text-white border-sage-600",
    hover: "border-cream-200 text-ink-500 hover:border-sage-400 hover:text-sage-700",
  },
  B: {
    selected: "bg-blue-500 text-white border-blue-500",
    hover: "border-cream-200 text-ink-500 hover:border-blue-300 hover:text-blue-600",
  },
  C: {
    selected: "bg-orange-500 text-white border-orange-500",
    hover: "border-cream-200 text-ink-500 hover:border-orange-300 hover:text-orange-600",
  },
};

// ===== メインコンポーネント =====

export default function PresidentHRAssessmentDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();

  const period = periodStore.active();
  const periodKey = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");

  const staff: Staff | null = staffId ? staffStore.get(staffId) : null;
  const manager: Staff | null = staff?.managerId ? staffStore.get(staff.managerId) : null;
  const hr: HRAssessment | null = staffId
    ? hrAssessmentStore.byStaffAndPeriod(staffId, periodKey)
    : null;

  const [pr, setPr] = useState<PresidentReview | null>(null);
  const [form, setForm] = useState<PresidentFormState>(EMPTY_FORM);
  const [saved, setSaved] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffId || !periodKey) return;
    const existing = presidentReviewStore.byStaffAndPeriod(staffId, periodKey);
    setPr(existing);
    if (existing?.hrFinalEvaluation) {
      const ev = existing.hrFinalEvaluation;
      setForm({
        items: {
          userCenteredAction: {
            rank: ev.userCenteredAction.rank,
            reason: ev.userCenteredAction.reason ?? "",
          },
          respectfulInteraction: {
            rank: ev.respectfulInteraction.rank,
            reason: ev.respectfulInteraction.reason ?? "",
          },
          teamwork: {
            rank: ev.teamwork.rank,
            reason: ev.teamwork.reason ?? "",
          },
          initiativeImprovement: {
            rank: ev.initiativeImprovement.rank,
            reason: ev.initiativeImprovement.reason ?? "",
          },
          responsibility: {
            rank: ev.responsibility.rank,
            reason: ev.responsibility.reason ?? "",
          },
        },
        overallRank: existing.overallRank ?? null,
        overallComment: existing.hrOverallComment ?? "",
      });
    }
  }, [staffId, periodKey]);

  // ===== ガード =====

  if (!staff || !period) {
    return <div className="text-ink-400 py-20 text-center">職員データが見つかりません。</div>;
  }

  if (!hr || hr.status !== "confirmed") {
    return (
      <>
        <div className="mb-4">
          <button
            onClick={() => navigate(-1)}
            className="text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            戻る
          </button>
        </div>
        <PageHeader title={staff.name} subtitle={`${staff.department} ／ ${staff.jobType}`} />
        <div className="card text-ink-400 py-10 text-center text-sm">
          <AlertCircle className="text-ink-300 mx-auto mb-3 h-6 w-6" />
          管理者の一次考課がまだ提出されていません。
        </div>
      </>
    );
  }

  // ===== イベントハンドラ =====

  const setItemRank = (key: HRKey, rank: EvalRank) => {
    setForm((f) => {
      const current = f.items[key];
      return {
        ...f,
        items: {
          ...f.items,
          [key]: { ...current, rank: current.rank === rank ? null : rank },
        },
      };
    });
    setSaved(false);
  };

  const setItemReason = (key: HRKey, reason: string) => {
    setForm((f) => ({
      ...f,
      items: { ...f.items, [key]: { ...f.items[key], reason } },
    }));
    setSaved(false);
  };

  const toggleOverallRank = (rank: EvalRank) => {
    setForm((f) => ({ ...f, overallRank: f.overallRank === rank ? null : rank }));
    setSaved(false);
  };

  // ===== バリデーション =====

  const validate = (): string | null => {
    const missing = HR_ITEMS.filter((item) => form.items[item.key].rank === null);
    if (missing.length > 0) {
      return `5項目すべての最終評価を選択してください（未選択：${missing.map((i) => i.label).join("、")}）`;
    }
    const needsReason = HR_ITEMS.filter((item) => {
      const managerRank = hr[item.key] as EvalRank | null;
      const presidentRank = form.items[item.key].rank;
      return (
        presidentRank !== null &&
        presidentRank !== managerRank &&
        !form.items[item.key].reason.trim()
      );
    });
    if (needsReason.length > 0) {
      return `管理者評価と異なる場合は変更理由が必要です（未入力：${needsReason.map((i) => i.label).join("、")}）`;
    }
    return null;
  };

  // ===== 保存 =====

  const doSave = (status: "pending" | "confirmed") => {
    const now = new Date().toISOString();
    const hrFinalEvaluation: HRPresidentEvaluation = {
      userCenteredAction: {
        rank: form.items.userCenteredAction.rank,
        reason: form.items.userCenteredAction.reason.trim() || undefined,
      },
      respectfulInteraction: {
        rank: form.items.respectfulInteraction.rank,
        reason: form.items.respectfulInteraction.reason.trim() || undefined,
      },
      teamwork: {
        rank: form.items.teamwork.rank,
        reason: form.items.teamwork.reason.trim() || undefined,
      },
      initiativeImprovement: {
        rank: form.items.initiativeImprovement.rank,
        reason: form.items.initiativeImprovement.reason.trim() || undefined,
      },
      responsibility: {
        rank: form.items.responsibility.rank,
        reason: form.items.responsibility.reason.trim() || undefined,
      },
    };
    const item: PresidentReview = pr
      ? {
          ...pr,
          hrAssessmentId: hr.id,
          hrFinalEvaluation,
          overallRank: form.overallRank ?? undefined,
          hrOverallComment: form.overallComment.trim() || undefined,
          status,
          reviewedAt: status === "confirmed" ? now : pr.reviewedAt,
        }
      : {
          id: uid("pr"),
          staffId: staff.id,
          period: periodKey,
          reviewedAt: status === "confirmed" ? now : null,
          presidentMemo: "",
          finalNote: "",
          compensationNote: "",
          hrAssessmentId: hr.id,
          hrFinalEvaluation,
          overallRank: form.overallRank ?? undefined,
          hrOverallComment: form.overallComment.trim() || undefined,
          status,
        };
    presidentReviewStore.upsert(item);
    setPr(item);
    setSaved(true);
    setSavedConfirmed(status === "confirmed");
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ===== 表示用 =====

  const stepInfo = staff.growthStep
    ? GROWTH_STEP_OPTIONS.find((s) => s.value === staff.growthStep)
    : null;

  const isConfirmed = pr?.status === "confirmed" && !!pr.hrFinalEvaluation;

  return (
    <>
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          戻る
        </button>
      </div>

      <PageHeader
        title={staff.name}
        subtitle={`${staff.department} ／ ${staff.jobType} ／ 担当管理者：${manager?.name ?? "—"}`}
        right={
          isConfirmed ? (
            <span className="bg-sage-50 text-sage-700 border-sage-200 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              最終考課確定済
            </span>
          ) : undefined
        }
      />

      {/* 保存トースト */}
      {saved && (
        <div className="bg-sage-500 shadow-soft fixed right-6 bottom-6 z-30 flex animate-pulse items-center gap-2 rounded-full px-5 py-3 text-white">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">
            {savedConfirmed ? "最終考課を確定しました" : "下書き保存しました"}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {/* 基本情報 */}
        <div className="card bg-cream-50 border-cream-200">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="text-ink-400 mb-0.5 text-xs">対象期間</div>
              <div className="text-ink-800 font-medium">{period.label}</div>
            </div>
            <div>
              <div className="text-ink-400 mb-0.5 text-xs">所属</div>
              <div className="text-ink-800 font-medium">{staff.department}</div>
            </div>
            <div>
              <div className="text-ink-400 mb-0.5 text-xs">担当管理者</div>
              <div className="text-ink-800 font-medium">{manager?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-ink-400 mb-0.5 text-xs">現在の成長STEP</div>
              <div className="text-ink-800 font-medium">{stepInfo?.label ?? "未設定"}</div>
            </div>
          </div>
        </div>

        {/* 5項目 最終考課 */}
        <section>
          <h2 className="text-ink-800 mb-4 flex items-center gap-2 text-base font-bold">
            <span className="bg-warm-500 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
              1
            </span>
            5項目 最終考課
          </h2>
          <div className="space-y-5">
            {HR_ITEMS.map((item) => {
              const managerRank = hr[item.key] as EvalRank | null;
              const managerEvidence = hr[`${item.key}Evidence` as keyof HRAssessment] as string;
              const itemForm = form.items[item.key];
              const isChanged = itemForm.rank !== null && itemForm.rank !== managerRank;
              const aStandard = staff.growthStep
                ? STEP_A_STANDARDS[staff.growthStep][item.key]
                : null;

              return (
                <div key={item.key} className="card">
                  <h3 className="text-ink-800 mb-1 font-bold">{item.label}</h3>
                  <p className="text-ink-500 mb-3 text-xs leading-relaxed">{item.description}</p>

                  {/* このSTEPの標準（A） */}
                  {aStandard && (
                    <div className="bg-sage-50 border-sage-200 mb-4 rounded-xl border px-3 py-2.5">
                      <div className="text-sage-600 mb-1 text-[11px] font-bold">
                        このSTEPの標準（A）
                      </div>
                      <p className="text-ink-700 text-xs leading-relaxed">「{aStandard}」</p>
                    </div>
                  )}

                  {/* 管理者の一次評価 */}
                  <div className="bg-cream-50 border-cream-200 mb-4 rounded-xl border px-3 py-3">
                    <div className="text-ink-500 mb-2 text-[11px] font-bold">管理者の一次評価</div>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <EvalBadge rank={managerRank} size="lg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-ink-400 mb-1 text-[11px]">
                          判断の根拠となった具体的な行動・事実
                        </div>
                        <div className="text-ink-700 text-xs leading-relaxed whitespace-pre-wrap">
                          {managerEvidence || "（記録なし）"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 社長最終評価 */}
                  <div>
                    <div className="text-ink-400 mb-2 text-xs font-bold">社長最終評価</div>
                    <div className="flex flex-wrap gap-2">
                      {EVAL_RANKS.map((rank) => {
                        const colors = RANK_COLORS[rank];
                        const isSelected = itemForm.rank === rank;
                        return (
                          <button
                            key={rank}
                            type="button"
                            onClick={() => setItemRank(item.key, rank)}
                            className={`h-10 rounded-full border px-5 text-sm font-bold transition ${
                              isSelected ? colors.selected : `bg-white ${colors.hover}`
                            }`}
                          >
                            {rank}
                            {rank === "A" && !isSelected && (
                              <span className="ml-1.5 text-xs font-normal opacity-50">標準</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* 変更理由（管理者と異なる場合のみ表示・必須） */}
                    {isChanged && (
                      <div className="mt-3">
                        <label className="block">
                          <div className="text-warm-600 mb-1.5 flex items-center gap-1 text-xs font-bold">
                            <AlertCircle className="h-3.5 w-3.5" />
                            評価を変更した理由 <span className="text-warm-500">（必須）</span>
                          </div>
                          <textarea
                            className="input-base border-warm-200 bg-warm-50 min-h-[72px] resize-y text-sm leading-relaxed"
                            placeholder="管理者の評価から変更した理由を記録してください"
                            value={itemForm.reason}
                            onChange={(e) => setItemReason(item.key, e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 総合評価 */}
        <section>
          <h2 className="text-ink-800 mb-4 flex items-center gap-2 text-base font-bold">
            <span className="bg-warm-500 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
              2
            </span>
            総合評価
          </h2>
          <div className="card">
            <div className="bg-cream-50 border-cream-200 mb-4 rounded-xl border px-3 py-2.5">
              <p className="text-ink-600 text-xs leading-relaxed">
                総合評価は5項目の単純平均ではありません。職員の役割、成長STEP、具体的な行動事実を踏まえて総合的に判断してください。
              </p>
            </div>
            <div className="text-ink-400 mb-2 text-xs font-bold">総合評価を選択</div>
            <div className="flex flex-wrap gap-2">
              {EVAL_RANKS.map((rank) => {
                const colors = RANK_COLORS[rank];
                const isSelected = form.overallRank === rank;
                return (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => toggleOverallRank(rank)}
                    className={`h-10 rounded-full border px-5 text-sm font-bold transition ${
                      isSelected ? colors.selected : `bg-white ${colors.hover}`
                    }`}
                  >
                    {rank}
                    {rank === "A" && !isSelected && (
                      <span className="ml-1.5 text-xs font-normal opacity-50">標準</span>
                    )}
                  </button>
                );
              })}
            </div>
            {form.overallRank && (
              <div className="text-ink-700 mt-3 text-sm">
                総合評価：<span className="font-bold">{form.overallRank}</span>
              </div>
            )}

            {/* 社長総合所見 */}
            <div className="border-cream-200 mt-5 border-t pt-4">
              <label className="block">
                <div className="text-ink-800 mb-1 text-sm font-bold">社長総合所見</div>
                <p className="text-ink-400 mb-2 text-xs leading-relaxed">
                  職員の強み・半年間の成長・今後期待すること・総合評価の判断理由など（任意）
                </p>
                <textarea
                  className="input-base min-h-[100px] resize-y leading-relaxed"
                  placeholder="例：利用者への目配りと報告の姿勢が安定してきた。チームへの関わりを次の半年で伸ばしてほしい。"
                  value={form.overallComment}
                  onChange={(e) => setForm((f) => ({ ...f, overallComment: e.target.value }))}
                />
              </label>
            </div>
          </div>
        </section>

        {/* エラー */}
        {submitError && (
          <div className="card border-orange-200 bg-orange-50">
            <p className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {submitError}
            </p>
          </div>
        )}

        {/* 保存ボタン */}
        <div className="sticky bottom-4 flex flex-col justify-end gap-3 pb-2 sm:flex-row">
          <button type="button" onClick={() => doSave("pending")} className="btn-secondary">
            <Save className="h-4 w-4" />
            下書き保存
          </button>
          <button
            type="button"
            onClick={() => {
              const error = validate();
              if (error) {
                setSubmitError(error);
                window.scrollTo({ top: 0, behavior: "smooth" });
              } else {
                doSave("confirmed");
              }
            }}
            className="btn-primary"
          >
            <CheckCircle2 className="h-4 w-4" />
            最終考課を確定する
          </button>
        </div>
      </div>
    </>
  );
}
