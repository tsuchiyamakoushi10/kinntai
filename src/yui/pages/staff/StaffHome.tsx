"use client";

import { useEffect, useState } from "react";
import { Link } from "@/yui/router";
import {
  FileText,
  MessageCircle,
  Sparkles,
  Heart,
  ChevronRight,
  CheckCircle2,
  Target,
  Hourglass,
  ClipboardCheck,
  PartyPopper,
  Crown,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/yui/auth";
import {
  staffInterviewStore,
  managerInterviewStore,
  presidentReviewStore,
  growthExpectationStore,
  growthPathStore,
  periodStore,
} from "@/yui/storage";
import type {
  StaffInterview,
  ManagerInterview,
  Period,
  GrowthExpectation,
  GrowthPath,
  PresidentReview,
} from "../../types";
import { GROWTH_STAGES } from "../../types";
import { formatDate } from "../../utils/date";
import StepIndicator, { calculateStep, type StepNumber } from "../../components/StepIndicator";

interface StatusConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaPrimary: boolean;
  tone: "urgent" | "waiting" | "review" | "celebrate";
  Icon: React.ComponentType<{ className?: string }>;
}

const STATUS_BY_STEP: Record<StepNumber, StatusConfig> = {
  1: {
    eyebrow: "CURRENT STATUS",
    title: "面談シートを未提出です",
    subtitle: "10〜15分程度で書けます。\nあなたの言葉でぜひ教えてください。",
    ctaLabel: "今期の振り返りを入力する",
    ctaPrimary: true,
    tone: "urgent",
    Icon: FileText,
  },
  2: {
    eyebrow: "CURRENT STATUS",
    title: "管理者面談を待っています",
    subtitle:
      "シートをご提出いただきありがとうございました。\n面談の前に内容を見直すこともできます。",
    ctaLabel: "シートを確認・編集する",
    ctaPrimary: false,
    tone: "waiting",
    Icon: Hourglass,
  },
  3: {
    eyebrow: "CURRENT STATUS",
    title: "社長確認中です",
    subtitle: "管理者面談ありがとうございました。\n社長からのコメントをお待ちください。",
    ctaLabel: "提出内容を確認する",
    ctaPrimary: false,
    tone: "review",
    Icon: ClipboardCheck,
  },
  4: {
    eyebrow: "CURRENT STATUS",
    title: "今期、お疲れさまでした 🌱",
    subtitle: "今期の面談・評価が完了しました。\nあなたの頑張りに感謝します。",
    ctaLabel: "今期の内容を見る",
    ctaPrimary: false,
    tone: "celebrate",
    Icon: PartyPopper,
  },
};

const TONE_STYLES: Record<StatusConfig["tone"], { bg: string; chip: string }> = {
  urgent: {
    bg: "bg-gradient-to-br from-warm-100 via-cream-50 to-warm-50 border-warm-200",
    chip: "bg-warm-500 text-white",
  },
  waiting: {
    bg: "bg-gradient-to-br from-sage-50 via-cream-50 to-warm-50 border-sage-100",
    chip: "bg-sage-500 text-white",
  },
  review: {
    bg: "bg-gradient-to-br from-warm-50 via-cream-50 to-sage-50 border-warm-100",
    chip: "bg-warm-300 text-warm-600",
  },
  celebrate: {
    bg: "bg-gradient-to-br from-warm-100 via-warm-50 to-sage-50 border-warm-200",
    chip: "bg-warm-500 text-white",
  },
};

export default function StaffHome() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period | null>(null);
  const [interviews, setInterviews] = useState<StaffInterview[]>([]);
  const [managerInterviews, setManagerInterviews] = useState<ManagerInterview[]>([]);
  const [presidentReview, setPresidentReview] = useState<PresidentReview | null>(null);
  const [growthExpectation, setGrowthExpectation] = useState<GrowthExpectation | null>(null);
  const [growthPath, setGrowthPath] = useState<GrowthPath | null>(null);

  useEffect(() => {
    if (!user) return;
    const p = periodStore.active();
    setPeriod(p);
    const pk = p?.label === "2026年 上期" ? "2026-上期" : (p?.label ?? "");

    setInterviews(
      staffInterviewStore
        .byStaff(user.id)
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")),
    );
    setManagerInterviews(managerInterviewStore.byStaff(user.id));
    setPresidentReview(presidentReviewStore.byStaffAndPeriod(user.id, pk));
    setGrowthExpectation(growthExpectationStore.byStaffAndPeriod(user.id, pk));
    setGrowthPath(growthPathStore.byStaff(user.id));
  }, [user]);

  if (!user || !period) return null;

  const periodKey = period.label === "2026年 上期" ? "2026-上期" : period.label;
  const myCurrent = interviews.find((i) => i.period === periodKey) ?? null;
  const myManagerCurrent = managerInterviews.find((m) => m.period === periodKey) ?? null;

  const currentStep = calculateStep(
    !!myCurrent,
    myManagerCurrent?.status ?? null,
    presidentReview?.status ?? null,
  );

  const status = STATUS_BY_STEP[currentStep];
  const toneStyle = TONE_STYLES[status.tone];

  const lastDoneManager = managerInterviews
    .filter((m) => m.status === "done" && (m.expectation || m.strength))
    .sort((a, b) => (b.interviewedAt ?? "").localeCompare(a.interviewedAt ?? ""))[0];

  const nextStageLabel = growthPath?.nextStage
    ? (GROWTH_STAGES.find((s) => s.value === growthPath.nextStage)?.label ?? "次のステージ")
    : null;
  const experienceLabel = nextStageLabel
    ? `${nextStageLabel}になるために経験すること`
    : "半年後の目標に向けて経験すること";

  // 「次の半年で大切にすること」= 期待する役割（タグ）＋ 行動計画のうち未表示分
  const valuableRoles = myManagerCurrent?.expectedRoles ?? [];
  const valuableItems = growthExpectation?.items ?? [];
  const hasValuable = valuableRoles.length > 0 || valuableItems.length > 0;

  return (
    <>
      {/* ウェルカム */}
      <section className="mb-5">
        <div className="text-warm-500 mb-1 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          <span className="text-xs font-bold tracking-[0.2em]">私のホーム</span>
        </div>
        <h1 className="text-ink-800 text-2xl font-bold tracking-tight md:text-3xl">
          こんにちは、{user.name.split(" ")[0]}さん
        </h1>
        <p className="text-ink-400 mt-1 text-sm">あなたの成長を、私たちは応援しています。</p>
      </section>

      {/* ─────── 成長ストーリー ─────── */}

      {/* 1. 私の成長ストーリー（現在地 → 半年後の目標） */}
      <section className="mb-4">
        {growthPath ? (
          <div className="card p-5 md:p-6">
            <div className="text-sage-600 mb-4 text-[10px] font-bold tracking-[0.2em]">
              私の成長ストーリー
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="bg-sage-50 border-sage-200 flex-1 rounded-2xl border p-4">
                <div className="text-sage-600 mb-1 text-[10px] font-bold tracking-wider">
                  現在地
                </div>
                <div className="text-ink-800 text-2xl leading-tight font-bold">
                  {GROWTH_STAGES.find((s) => s.value === growthPath.currentStage)?.label ?? "—"}
                </div>
                <div className="text-ink-400 mt-1 text-xs leading-relaxed">
                  {GROWTH_STAGES.find((s) => s.value === growthPath.currentStage)?.description ??
                    ""}
                </div>
              </div>
              <div className="text-warm-300 flex shrink-0 items-center justify-center">
                <ChevronRight className="hidden h-7 w-7 sm:block" />
                <div className="text-ink-300 py-1 text-center text-lg sm:hidden">↓</div>
              </div>
              <div className="bg-warm-50 border-warm-300 flex-1 rounded-2xl border border-dashed p-4">
                <div className="text-warm-500 mb-1 text-[10px] font-bold tracking-wider">
                  半年後の目標
                </div>
                <div className="text-ink-800 text-2xl leading-tight font-bold">
                  {growthPath.nextStage
                    ? (GROWTH_STAGES.find((s) => s.value === growthPath.nextStage)?.label ?? "—")
                    : "設定中..."}
                </div>
                {growthPath.nextStage && (
                  <div className="text-ink-400 mt-1 text-xs leading-relaxed">
                    {GROWTH_STAGES.find((s) => s.value === growthPath.nextStage)?.description ?? ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-5 text-center md:p-6">
            <div className="text-sage-600 mb-3 text-[10px] font-bold tracking-[0.2em]">
              私の成長ストーリー
            </div>
            <p className="text-ink-500 text-sm leading-relaxed">
              まだ育成計画が作成されていません。
              <br />
              管理者面談を通じて、あなたの成長ストーリーを一緒に描いていきましょう。
            </p>
          </div>
        )}
      </section>

      {/* 2. あなたの強み */}
      {myManagerCurrent?.status === "done" && myManagerCurrent.strength && (
        <section className="mb-4">
          <div className="card bg-sage-50 border-sage-100">
            <div className="text-sage-600 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">あなたの強み</span>
            </div>
            <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
              {myManagerCurrent.strength}
            </p>
          </div>
        </section>
      )}

      {/* 3. 〇〇になるために経験すること */}
      {growthExpectation && growthExpectation.items.length > 0 && (
        <section className="mb-4">
          <div className="card">
            <div className="text-warm-500 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">{experienceLabel}</span>
            </div>
            <ul className="space-y-2">
              {growthExpectation.items.map((item, i) => (
                <li
                  key={i}
                  className="bg-cream-50 border-cream-200 flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
                >
                  <div className="bg-warm-100 text-warm-600 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                    {i + 1}
                  </div>
                  <span className="text-ink-800 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 4. 半年後のビジョン */}
      {growthPath?.aspirationNote && (
        <section className="mb-4">
          <div className="card from-warm-50 to-cream-50 border-warm-100 bg-gradient-to-br">
            <div className="text-warm-500 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">半年後のビジョン</span>
            </div>
            <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
              {growthPath.aspirationNote}
            </p>
          </div>
        </section>
      )}

      {/* 5. 次の半年で大切にすること */}
      {myManagerCurrent?.status === "done" && hasValuable && (
        <section className="mb-4">
          <div className="card bg-cream-50 border-cream-200">
            <div className="text-ink-600 mb-3 flex items-center gap-2">
              <Heart className="text-warm-400 h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">次の半年で大切にすること</span>
            </div>
            <ul className="space-y-2.5">
              {valuableItems.map((item, i) => (
                <li key={`item-${i}`} className="flex items-start gap-2.5">
                  <span className="bg-warm-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="text-ink-800 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
              {valuableRoles.map((role, i) => (
                <li key={`role-${i}`} className="flex items-start gap-2.5">
                  <span className="bg-sage-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="text-ink-700 text-sm leading-relaxed">{role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6. 管理者からの応援メッセージ */}
      {myManagerCurrent?.status === "done" && myManagerCurrent.expectation && (
        <section className="mb-8">
          <div className="card bg-warm-50 border-warm-200">
            <div className="text-warm-600 mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">管理者からの応援メッセージ</span>
            </div>
            <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
              {myManagerCurrent.expectation}
            </p>
          </div>
        </section>
      )}

      {/* ─────── 会社からのメッセージ ─────── */}

      {/* 7. 代表からのメッセージ */}
      {presidentReview &&
        (presidentReview.presidentMessage?.trim() ||
          presidentReview.talentPotential ||
          (presidentReview.nextAssignmentTags?.length ?? 0) > 0 ||
          presidentReview.developmentPolicy?.trim()) && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Crown className="text-warm-500 h-5 w-5" />
              <h2 className="text-ink-800 text-lg font-bold">代表からのメッセージ</h2>
            </div>
            <div className="card from-warm-100 via-cream-50 to-warm-50 border-warm-200 space-y-4 bg-gradient-to-br">
              {presidentReview.talentPotential && (
                <div>
                  <div className="text-warm-600 mb-1.5 text-xs font-bold">期待するポジション</div>
                  <span className="chip bg-warm-500 text-white">
                    {presidentReview.talentPotential}
                  </span>
                </div>
              )}
              {(presidentReview.nextAssignmentTags?.length ?? 0) > 0 && (
                <div>
                  <div className="text-warm-600 mb-2 text-xs font-bold">次に担ってほしい仕事</div>
                  <div className="flex flex-wrap gap-1.5">
                    {presidentReview.nextAssignmentTags!.map((tag) => (
                      <span
                        key={tag}
                        className="chip border-warm-200 text-warm-700 border bg-white"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {presidentReview.developmentPolicy?.trim() && (
                <div>
                  <div className="text-warm-600 mb-1.5 text-xs font-bold">育成の方向性</div>
                  <p className="text-ink-700 border-warm-100 rounded-xl border bg-white/60 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {presidentReview.developmentPolicy}
                  </p>
                </div>
              )}
              {presidentReview.presidentMessage?.trim() && (
                <div>
                  <div className="text-warm-600 mb-1.5 text-xs font-bold">代表からの言葉</div>
                  <p className="text-ink-800 leading-relaxed whitespace-pre-wrap">
                    {presidentReview.presidentMessage}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

      {/* ─────── 面談の詳細・記録 ─────── */}

      {/* 8. 面談ステータス */}
      <section className="mb-5">
        {currentStep === 4 ? (
          <div className="bg-sage-50 border-sage-100 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm">
            <CheckCircle2 className="text-sage-500 h-4 w-4 shrink-0" />
            <span className="text-sage-700 font-medium">今期の面談完了</span>
            <span className="text-ink-400 text-xs">— {period.label}</span>
            <Link
              to="/staff/interview"
              className="text-ink-400 hover:text-ink-800 ml-auto flex items-center gap-0.5 text-xs transition"
            >
              内容を確認
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className={`card p-4 ${toneStyle.bg}`}>
            <div className="flex items-start gap-3">
              <status.Icon className="text-warm-500 mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-ink-800 text-sm leading-snug font-bold">{status.title}</div>
                <div className="text-ink-500 mt-0.5 text-xs">{status.subtitle.split("\n")[0]}</div>
              </div>
              <Link
                to="/staff/interview"
                className={`shadow-soft inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-xs font-bold transition ${
                  status.ctaPrimary
                    ? "bg-warm-500 hover:bg-warm-600 text-white"
                    : "text-ink-800 border-cream-200 hover:bg-cream-50 border bg-white"
                }`}
              >
                {status.ctaLabel}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </section>

      <StepIndicator current={currentStep} />

      {/* 管理者からのフィードバック（詳細） */}
      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="text-warm-500 h-5 w-5" />
          <h2 className="text-ink-800 text-lg font-bold">管理者からのフィードバック</h2>
        </div>
        {myManagerCurrent?.status === "done" ? (
          <div className="card bg-sage-50 border-sage-100 space-y-4">
            {myManagerCurrent.issue && (
              <div>
                <div className="text-sage-600 mb-1 text-xs font-bold">次に磨くこと</div>
                <p className="text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {myManagerCurrent.issue}
                </p>
              </div>
            )}
            {myManagerCurrent.followUp && (
              <div>
                <div className="text-sage-600 mb-1 text-xs font-bold">サポート内容</div>
                <p className="text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {myManagerCurrent.followUp}
                </p>
              </div>
            )}
            {!myManagerCurrent.issue && !myManagerCurrent.followUp && (
              <p className="text-ink-400 text-sm">詳細フィードバックはありません。</p>
            )}
            <div className="text-ink-400 border-sage-100 border-t pt-2 text-xs">
              {formatDate(myManagerCurrent.interviewedAt)} 管理者面談より
            </div>
          </div>
        ) : (
          <div className="card text-ink-400 py-8 text-center text-sm leading-relaxed">
            まだフィードバックはありません。
            <br />
            管理者面談の後に、ここに表示されます。
          </div>
        )}
      </section>

      {/* 前回いただいた期待 */}
      {lastDoneManager &&
        lastDoneManager.id !== myManagerCurrent?.id &&
        lastDoneManager.expectation && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="text-warm-500 h-5 w-5" />
              <h2 className="text-ink-800 text-lg font-bold">前回いただいた期待</h2>
            </div>
            <div className="card bg-warm-50 border-warm-100">
              <p className="text-ink-800 leading-relaxed whitespace-pre-wrap">
                {lastDoneManager.expectation}
              </p>
              <div className="text-ink-400 mt-3 text-xs">
                {formatDate(lastDoneManager.interviewedAt)}
              </div>
            </div>
          </section>
        )}

      {/* 面談の記録 */}
      <section>
        <h2 className="text-ink-800 mb-3 text-lg font-bold">面談の記録</h2>
        {interviews.length === 0 ? (
          <div className="card text-ink-400 py-8 text-center text-sm">まだ面談履歴はありません</div>
        ) : (
          <div className="space-y-2">
            {interviews.slice(0, 5).map((iv) => {
              const mi = managerInterviews.find((m) => m.period === iv.period);
              return (
                <div key={iv.id} className="card flex items-center gap-3">
                  <div className="bg-warm-50 text-warm-500 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-800 font-medium">{iv.period}</div>
                    <div className="text-ink-400 text-xs">
                      提出 {formatDate(iv.submittedAt)}
                      {mi?.interviewedAt && ` ／ 面談 ${formatDate(mi.interviewedAt)}`}
                    </div>
                  </div>
                  <div>
                    {mi?.status === "done" ? (
                      <span className="chip bg-sage-100 text-sage-600">面談完了</span>
                    ) : (
                      <span className="chip bg-warm-100 text-warm-600">面談前</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 自分のプロフィール（折りたたみ） */}
      <section className="mt-8">
        <details className="card group">
          <summary className="text-ink-600 hover:text-ink-800 flex cursor-pointer items-center gap-2 text-sm transition">
            <ChevronRight className="h-4 w-4 transition group-open:rotate-90" />
            自分の登録情報
          </summary>
          <div className="text-ink-600 mt-4 grid grid-cols-1 gap-3 pl-6 text-sm sm:grid-cols-2">
            <div>
              <div className="text-ink-400 text-xs">所属</div>
              <div className="text-ink-800">{user.department}</div>
            </div>
            <div>
              <div className="text-ink-400 text-xs">職種</div>
              <div className="text-ink-800">{user.jobType}</div>
            </div>
            <div>
              <div className="text-ink-400 text-xs">勤務形態</div>
              <div className="text-ink-800">{user.employmentType}</div>
            </div>
            <div>
              <div className="text-ink-400 text-xs">入社日</div>
              <div className="text-ink-800">{formatDate(user.joinedAt)}</div>
            </div>
          </div>
        </details>
      </section>
    </>
  );
}
