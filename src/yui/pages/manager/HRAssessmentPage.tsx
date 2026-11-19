"use client";

import { useEffect, useState } from "react";
import { Link, useParams } from "@/yui/router";
import { ArrowLeft, Save, CheckCircle2, ShieldAlert, ChevronDown } from "lucide-react";
import { useAuth } from "@/yui/auth";
import { staffStore, hrAssessmentStore, periodStore, uid } from "@/yui/storage";
import type { Staff, HRAssessment, EvalRank, GrowthStep } from "../../types";
import { EVAL_RANKS, GROWTH_STEP_OPTIONS } from "../../types";
import PageHeader from "../../components/PageHeader";

// ===== 定数・型 =====

export const HR_ITEMS = [
  {
    key: "userCenteredAction" as const,
    label: "① 利用者を想い、考えて行動する",
    description:
      "利用者をよく見て、「この方にとって何がよいか」を考え、必要な行動につなげているか。",
  },
  {
    key: "respectfulInteraction" as const,
    label: "② 相手を尊重した関わり・接遇",
    description:
      "利用者・家族・職員に対して、相手の立場や気持ちを尊重した言葉・態度・関わりができているか。",
  },
  {
    key: "teamwork" as const,
    label: "③ 仲間と支え合う・チームワーク",
    description:
      "自分の仕事だけでなく周囲にも目を向け、声を掛け、助け合い、必要な情報共有ができているか。",
  },
  {
    key: "initiativeImprovement" as const,
    label: "④ 自ら考え、より良くしようとする姿勢",
    description:
      "指示を待つだけではなく、気づき、考え、工夫し、必要に応じて提案・改善につなげようとしているか。",
  },
  {
    key: "responsibility" as const,
    label: "⑤ 役割を果たす・責任ある仕事",
    description:
      "自分の役割を理解し、任された仕事・報告連絡相談・時間やルールなどに責任を持って取り組んでいるか。",
  },
];

const RANK_CRITERIA = [
  {
    rank: "S" as EvalRank,
    label: "期待を上回る",
    desc: "求められる行動を安定して行い、さらに周囲にも良い影響を与えている",
    standard: false,
  },
  {
    rank: "A" as EvalRank,
    label: "できている",
    desc: "その人の役割として求められる行動が日常的にできている",
    standard: true,
  },
  {
    rank: "B" as EvalRank,
    label: "これから伸ばしたい",
    desc: "一部できているが、まだ安定していない。今後の成長を期待する",
    standard: false,
  },
  {
    rank: "C" as EvalRank,
    label: "改善が必要",
    desc: "求められる行動が十分に見られず、具体的な改善や支援が必要",
    standard: false,
  },
];

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

export type HRKey = (typeof HR_ITEMS)[number]["key"];

interface FormState {
  userCenteredAction: EvalRank | null;
  userCenteredActionEvidence: string;
  respectfulInteraction: EvalRank | null;
  respectfulInteractionEvidence: string;
  teamwork: EvalRank | null;
  teamworkEvidence: string;
  initiativeImprovement: EvalRank | null;
  initiativeImprovementEvidence: string;
  responsibility: EvalRank | null;
  responsibilityEvidence: string;
  overallComment: string;
}

const EMPTY_FORM: FormState = {
  userCenteredAction: null,
  userCenteredActionEvidence: "",
  respectfulInteraction: null,
  respectfulInteractionEvidence: "",
  teamwork: null,
  teamworkEvidence: "",
  initiativeImprovement: null,
  initiativeImprovementEvidence: "",
  responsibility: null,
  responsibilityEvidence: "",
  overallComment: "",
};

// ===== STEP別 A評価行動基準 =====

export const STEP_A_STANDARDS: Record<GrowthStep, Record<HRKey, string>> = {
  STEP1: {
    userCenteredAction:
      "担当する利用者の日常の変化に気づき、気になることを記録したり先輩・上司に伝えている",
    respectfulInteraction:
      "利用者・家族・同僚に対して、言葉遣いや態度など基本的な接遇が日常的に保たれている",
    teamwork:
      "必要な報告・連絡・相談を行い、分からないことは確認しながら、周囲と協力して仕事ができる",
    initiativeImprovement:
      "業務の意味や理由を自分から理解しようとし、疑問点は放置せず確認・質問している",
    responsibility:
      "基本的なルールや手順を守って担当業務に取り組み、分からないことやできないことをそのままにせず、確認・報告できる",
  },
  STEP2: {
    userCenteredAction:
      "利用者の状態や意向を確認したうえで、その場での対応を自分なりに判断して行動できる",
    respectfulInteraction:
      "相手の様子やタイミングを見て、伝え方や言葉の選び方を工夫した関わりができている",
    teamwork: "周囲の状況を観察し、声をかけたり手を貸したりと、自分から協力的に行動できる",
    initiativeImprovement:
      "日常業務の中で気になること・改善できそうな点に気づき、自分なりの工夫や提案を実際に行動に移している",
    responsibility:
      "担当業務を確実にこなしながら、状況の変化に応じて優先順位を自分で判断して動けている",
  },
  STEP3: {
    userCenteredAction:
      "利用者一人ひとりの背景や生活歴を踏まえた個別対応ができ、後輩が迷ったときに具体的な対応の視点を伝えられる",
    respectfulInteraction:
      "後輩や立場の異なる人に対しても相手を尊重した関わりを日常的に示しており、周囲のモデルになっている",
    teamwork:
      "困っている後輩や仲間に気づいてサポートし、自分のやり方やノウハウを具体的に共有できる",
    initiativeImprovement:
      "自分の担当だけでなく周囲の課題にも目を向け、改善のアイデアをチームと共有・提案できる",
    responsibility:
      "自分の役割を果たしながら、周囲の状況を見て必要な調整や支援を行い、業務全体が滞らないよう動ける",
  },
  STEP4: {
    userCenteredAction:
      "利用者に関する情報や気づきをチームで共有し、統一した対応方針の形成に関わることができる",
    respectfulInteraction:
      "チーム内の関わり方の課題に気づき、具体的な改善提案や働きかけを実践している",
    teamwork: "チームの動きを観察し、協力しやすい環境をつくるための働きかけや調整ができる",
    initiativeImprovement: "チームの業務課題を整理し、改善策の検討・実行を主体的に担っている",
    responsibility:
      "チームの役割分担や業務の進行状況を把握し、問題が生じたときに適切に対応・調整できる",
  },
  STEP5: {
    userCenteredAction:
      "複数の利用者・家族・他職種の状況を総合的に捉え、支援の方向性についてチームに提起・提案できる",
    respectfulInteraction:
      "職種・部署を越えた場でも互いを尊重した関係の形成に働きかけており、組織全体の対応水準の向上に貢献している",
    teamwork:
      "部署・職種を越えた連携を自ら起こし、組織全体の協力関係や仕事の進め方の改善に貢献している",
    initiativeImprovement:
      "組織的な課題や制度・仕組みの改善を提起し、変化を起こすための具体的な行動を継続的に取っている",
    responsibility:
      "組織の方針や目標を意識して行動し、周囲が力を発揮しやすいよう働きかけ、自分の姿勢や仕事の進め方で良い影響を広げることができる",
  },
};

// ===== メインコンポーネント =====

export default function HRAssessmentPage() {
  const { staffId } = useParams<{ staffId: string }>();
  const { user } = useAuth();
  const period = periodStore.active();
  const periodKey = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");

  // staffは毎レンダリング時にlocalStorageから直接読む（HMRやキャッシュによる古いstate問題を防ぐ）
  const staff = staffId ? staffStore.get(staffId) : null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [existing, setExisting] = useState<HRAssessment | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffId) return;
    if (!periodKey) return;
    const found = hrAssessmentStore.byStaffAndPeriod(staffId, periodKey);
    if (found) {
      setExisting(found);
      setForm({
        userCenteredAction: found.userCenteredAction,
        userCenteredActionEvidence: found.userCenteredActionEvidence,
        respectfulInteraction: found.respectfulInteraction,
        respectfulInteractionEvidence: found.respectfulInteractionEvidence,
        teamwork: found.teamwork,
        teamworkEvidence: found.teamworkEvidence,
        initiativeImprovement: found.initiativeImprovement,
        initiativeImprovementEvidence: found.initiativeImprovementEvidence,
        responsibility: found.responsibility,
        responsibilityEvidence: found.responsibilityEvidence,
        overallComment: found.overallComment,
      });
    }
  }, [staffId, periodKey]);

  if (!user || !staff || !period) return null;

  const setRank = (key: HRKey, rank: EvalRank) => {
    setForm((f) => ({ ...f, [key]: f[key] === rank ? null : rank }));
    setSaved(false);
  };

  const setField = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const doSave = (status: "draft" | "confirmed") => {
    const now = new Date().toISOString();
    const item: HRAssessment = existing
      ? { ...existing, ...form, status, updatedAt: now }
      : {
          id: uid("hr"),
          staffId: staff.id,
          managerId: user.id,
          period: periodKey,
          ...form,
          status,
          updatedAt: now,
        };
    hrAssessmentStore.upsert(item);
    setExisting(item);
    setSaved(true);
    setSavedConfirmed(status === "confirmed");
    setConfirmPending(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateSubmit = (): string | null => {
    if (!staff.growthStep) {
      return "成長STEPが未設定です。職員カルテで設定後、改めて評価してください。";
    }
    const missing = HR_ITEMS.filter((item) => {
      const rank = form[item.key] as EvalRank | null;
      const evidence = form[`${item.key}Evidence` as keyof FormState] as string;
      return rank === null || !evidence.trim();
    });
    if (missing.length > 0) {
      return `5項目すべての評価ランクと根拠記録が必要です（未入力: ${missing.map((i) => i.label).join("、")}）`;
    }
    return null;
  };

  const isConfirmed = existing?.status === "confirmed";

  return (
    <>
      {/* 戻るリンク */}
      <div className="mb-4">
        <Link
          to={`/manager/staff/${staffId}`}
          className="text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          職員カルテに戻る
        </Link>
      </div>

      <PageHeader title="人事考課" subtitle={`${period.label} ／ ${staff.name}さん`} />

      {/* ステータスバッジ */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-[#EBF3FF] px-3 py-1 text-xs font-bold text-blue-700">
          <ShieldAlert className="h-3.5 w-3.5" />
          管理者・社長のみ閲覧可能
        </span>
        {isConfirmed && (
          <span className="bg-sage-50 text-sage-700 border-sage-200 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            確定済み
          </span>
        )}
      </div>

      {/* 保存完了メッセージ */}
      {saved && (
        <div className="card bg-sage-50 border-sage-100 mb-5">
          <div className="text-sage-600 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              {savedConfirmed ? "一次考課を提出しました。" : "一時保存しました。"}
            </span>
          </div>
        </div>
      )}

      {/* 現在STEPの表示 */}
      {(() => {
        const stepInfo = staff.growthStep
          ? GROWTH_STEP_OPTIONS.find((s) => s.value === staff.growthStep)
          : null;
        return stepInfo ? (
          <div className="card bg-cream-50 border-cream-200 mb-5">
            <div className="text-ink-400 mb-1 text-xs font-bold">今回の評価基準</div>
            <div className="text-ink-800 font-bold">{stepInfo.label}</div>
            <div className="text-ink-500 mt-0.5 mb-3 text-xs leading-relaxed">
              {stepInfo.description}
            </div>
            <p className="text-ink-600 text-xs">
              現在のSTEPで求められる行動を基準に評価してください。
            </p>
          </div>
        ) : (
          <div className="card bg-cream-50 border-cream-200 mb-5">
            <div className="text-ink-400 mb-1 text-xs font-bold">今回の評価基準</div>
            <p className="text-ink-600 text-xs">
              成長STEPが未設定です。職員カルテで設定後、改めて評価してください。
            </p>
          </div>
        );
      })()}

      {/* 評価の手引き */}
      <div className="card border-warm-200 mb-5 bg-[#FFFBF0]">
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setGuideOpen((o) => !o)}
        >
          <span className="text-ink-800 text-sm font-bold">📋 評価の手引き</span>
          <ChevronDown
            className={`text-ink-400 h-4 w-4 transition-transform ${guideOpen ? "rotate-180" : ""}`}
          />
        </button>
        {guideOpen && (
          <div className="text-ink-600 border-warm-100 mt-3 space-y-3 border-t pt-3 text-xs leading-relaxed">
            <div>
              <p className="text-ink-700 mb-1 font-bold">
                ① 利用者を想い、考えて行動する — 間接部門の読み替え
              </p>
              <p>
                事務・厨房など利用者と直接関わる機会が少ない職種は、利用者との直接的な関わりだけでなく、自分の仕事の先に利用者の生活や安心があることを考えて行動しているかを含めて評価してください。
              </p>
            </div>
            <div>
              <p className="text-ink-700 mb-1 font-bold">③と④の違い</p>
              <p>③チームワーク ＝ 人との協力・連携</p>
              <p>④自ら考える姿勢 ＝ 課題への気づき・工夫・改善行動</p>
            </div>
            <div>
              <p className="text-ink-700 mb-1 font-bold">評価の基本</p>
              <p>
                性格・人柄・好き嫌い・印象ではなく、実際に確認できた行動や事実をもとに評価してください。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 評価基準の説明 */}
      <div className="card mb-6 border-blue-200 bg-[#F3F8FF]">
        <h3 className="text-ink-800 mb-1 text-sm font-bold">評価基準</h3>
        <p className="text-ink-500 mb-3 text-xs leading-relaxed">
          <strong className="text-sage-700">A が標準的なよい評価</strong>
          です。役割に応じた行動が日常的にできていれば、A となります。
        </p>
        <div className="space-y-1.5">
          {RANK_CRITERIA.map(({ rank, label, desc, standard }) => (
            <div
              key={rank}
              className={`flex items-start gap-3 rounded-xl px-3 py-2 ${
                standard ? "bg-sage-50 border-sage-200 border" : "border-cream-100 border bg-white"
              }`}
            >
              <span
                className={`mt-0.5 w-5 shrink-0 text-sm font-bold ${
                  standard ? "text-sage-700" : "text-ink-500"
                }`}
              >
                {rank}
              </span>
              <div>
                <span
                  className={`text-sm font-bold ${standard ? "text-sage-800" : "text-ink-800"}`}
                >
                  {label}
                  {standard && (
                    <span className="bg-sage-100 text-sage-700 ml-2 rounded-full px-1.5 py-0.5 text-xs">
                      ★ 標準
                    </span>
                  )}
                </span>
                <p className="text-ink-500 mt-0.5 text-xs leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5評価項目 */}
      <div className="mb-5 space-y-5">
        {HR_ITEMS.map((item) => {
          const rankVal = form[item.key] as EvalRank | null;
          const evidenceVal = form[`${item.key}Evidence` as keyof FormState] as string;

          return (
            <div key={item.key} className="card border-blue-100 bg-[#F3F8FF]">
              <h3 className="text-ink-800 mb-1 font-bold">{item.label}</h3>
              <p className="text-ink-500 mb-3 text-xs leading-relaxed">{item.description}</p>

              {/* このSTEPの標準（A） */}
              {staff.growthStep && (
                <div className="bg-sage-50 border-sage-200 mb-4 rounded-xl border px-3 py-2.5">
                  <div className="text-sage-600 mb-1 text-[11px] font-bold">
                    このSTEPの標準（A）
                  </div>
                  <p className="text-ink-700 text-xs leading-relaxed">
                    「{STEP_A_STANDARDS[staff.growthStep][item.key]}」
                  </p>
                </div>
              )}

              {/* ランク選択ボタン */}
              <div className="mb-4">
                <div className="text-ink-400 mb-2 text-xs font-bold">評価を選択</div>
                <div className="flex flex-wrap gap-2">
                  {EVAL_RANKS.map((rank) => {
                    const colors = RANK_COLORS[rank];
                    const isSelected = rankVal === rank;
                    return (
                      <button
                        key={rank}
                        onClick={() => setRank(item.key, rank)}
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
              </div>

              {/* 事実記録 */}
              <label className="block">
                <div className="text-ink-400 mb-1.5 text-xs font-bold">
                  判断の根拠となった具体的な行動・事実
                </div>
                <textarea
                  className="input-base min-h-[88px] resize-y text-sm leading-relaxed"
                  placeholder="実際に観察した場面・行動を具体的に記録してください（印象や好き嫌いではなく、事実を）"
                  value={evidenceVal}
                  onChange={(e) => setField(`${item.key}Evidence`, e.target.value)}
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* 総合コメント */}
      <div className="card mb-6 border-blue-100 bg-[#F3F8FF]">
        <label className="block">
          <div className="text-ink-800 mb-1 font-bold">総合コメント（任意）</div>
          <p className="text-ink-400 mb-3 text-xs leading-relaxed">
            この期の総合的な所見、成長の印象、今後の方向性など
          </p>
          <textarea
            className="input-base min-h-[100px] resize-y leading-relaxed"
            placeholder="例：全体を通じてA評価が安定しており、特にチームワーク面での貢献が目立った半期でした。"
            value={form.overallComment}
            onChange={(e) => setField("overallComment", e.target.value)}
          />
        </label>
      </div>

      {/* 提出確認ダイアログ */}
      {confirmPending ? (
        <div className="card bg-warm-50 border-warm-200 mb-6">
          <p className="text-ink-800 mb-1 text-sm font-bold">この内容で一次考課を提出しますか？</p>
          <p className="text-ink-400 mb-4 text-xs">
            評価と、その根拠となる具体的な行動・事実をもう一度確認してください。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => setConfirmPending(false)} className="btn-secondary flex-1">
              戻って確認する
            </button>
            <button onClick={() => doSave("confirmed")} className="btn-primary flex-1">
              <CheckCircle2 className="h-4 w-4" />
              はい、提出します
            </button>
          </div>
        </div>
      ) : (
        <>
          {submitError && (
            <div className="card mb-4 border-orange-200 bg-orange-50">
              <p className="text-sm font-medium text-orange-700">{submitError}</p>
            </div>
          )}
          <div className="mb-6 flex flex-col items-center justify-end gap-3 sm:flex-row">
            <button onClick={() => doSave("draft")} className="btn-secondary">
              <Save className="h-4 w-4" />
              一時保存
            </button>
            <button
              onClick={() => {
                const error = validateSubmit();
                if (error) {
                  setSubmitError(error);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                  setSubmitError(null);
                  setConfirmPending(true);
                }
              }}
              className="btn-primary"
            >
              <CheckCircle2 className="h-4 w-4" />
              一次考課を提出する
            </button>
          </div>
        </>
      )}
    </>
  );
}
