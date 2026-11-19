"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "@/yui/router";
import {
  ArrowLeft,
  ChevronRight,
  Heart,
  Save,
  CheckCircle2,
  MessageCircle,
  Target,
  Sparkles,
  Plus,
  X,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/yui/auth";
import {
  staffStore,
  staffInterviewStore,
  managerInterviewStore,
  growthExpectationStore,
  growthPathStore,
  periodStore,
  uid,
} from "@/yui/storage";
import type {
  Staff,
  StaffInterview,
  ManagerInterview,
  EvalRank,
  Evaluation,
  GrowthExpectation,
  GrowthPath,
  GrowthStage,
  GrowthStep,
} from "../../types";
import {
  EVAL_LABELS,
  EVAL_RANKS,
  ROLE_TEMPLATES,
  EXPECTATION_TEMPLATES,
  GROWTH_STAGES,
  GROWTH_STEP_OPTIONS,
} from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { formatDate, formatDateTime, tenureLabel } from "../../utils/date";

const EMPTY_EVAL: Evaluation = {
  rinen: null,
  taiou: null,
  team: null,
  shutai: null,
  sekinin: null,
};

interface GuideContent {
  purpose: string;
  goodExamples: string[];
  badExamples: string[];
  tips: string;
}

const INTERVIEW_PRINCIPLES = [
  "人格ではなく行動を書く",
  "課題だけでなく成長可能性を書く",
  "次の一歩を具体的に示す",
];

const GUIDE_STRENGTH: GuideContent = {
  purpose: "職員が「自分の何が評価されているか」を理解し、自信を持てるようにします。",
  goodExamples: [
    "利用者の細かな変化に気づき、申し送りに具体的に記録している。チームの情報共有の質が上がった。",
    "新しい業務を前向きに引き受け、自分で調べて対応できている。周囲の安心感につながっている。",
  ],
  badExamples: ["頑張り屋さん", "真面目", "いつも笑顔", "性格が明るい"],
  tips: "「○○している → だから○○という効果がある」の形で書きましょう。性格ではなく行動と結果で伝えることで、本人がどう動けばよいかを理解できます。",
};

const GUIDE_ISSUE: GuideContent = {
  purpose: "職員が「次に伸ばすべきこと」を前向きに受け取れるよう、成長の方向性として伝えます。",
  goodExamples: [
    "急変時に一人で判断を抱え込む場面が見られる。看護師や上長に早めに相談するクセをつけると、チーム全体で安心して対応できるようになる。",
    "記録の書き方に個人差がある。申し送り研修に参加し、書き方の統一を意識してもらいたい。",
  ],
  badExamples: ["自主性が足りない", "言われたことしかやらない", "消極的", "報連相ができていない"],
  tips: "「〜する傾向がある → 〜するとよい」の構造で書きましょう。人格への評価ではなく、具体的な場面と改善の方向性を示すことで、本人が素直に受け取れます。",
};

const GUIDE_EXPECTATION: GuideContent = {
  purpose:
    "「会社があなたの成長を期待している」が伝わる言葉にします。職員ホームに本人が読む形で表示されます。",
  goodExamples: [
    "来期は新人のサポート役として、週1回の振り返りを一緒にやってみてください。あなたの丁寧さが後輩の安心感につながります。",
    "担当者会議に積極的に参加し、ご家族対応の経験を積んでほしいです。あなたには相手の気持ちを受け取る力があります。",
  ],
  badExamples: ["もっと頑張ってほしい", "期待しています", "チームのために尽力してください"],
  tips: "「何を・いつ・どのように」を入れましょう。本人の強みと結びつけて伝えることで、やる気につながります。命令ではなく「一緒に目指す」トーンで書いてください。",
};

interface StageGuide {
  requirements: string[];
  recommendedRoles: string[];
  suggestedExpectations: string[];
  philosophy?: { title: string; items: string[] };
}

const CROSS_HEART_MANAGER_PHILOSOPHY = {
  title: "クロスハートの管理者とは",
  items: ["利用者様を守る人", "職員を育てる人", "チームをまとめる人", "事業所を成長させる人"],
};

const STAGE_GUIDE: Partial<Record<GrowthStage, StageGuide>> = {
  contributor: {
    requirements: [
      "担当業務を一人でこなせている",
      "後輩への声かけを自然にしている",
      "申し送りが丁寧にできている",
    ],
    recommendedRoles: ["後輩育成", "チーム連携", "安定勤務"],
    suggestedExpectations: ["後輩への声掛け", "安定勤務を継続", "チーム連携強化"],
  },
  leader_candidate: {
    requirements: [
      "後輩への指導経験がある",
      "業務改善に関心がある",
      "他職種との連携経験がある",
      "チームリーダーの補佐をしたことがある",
    ],
    recommendedRoles: ["リーダーシップ", "後輩育成", "提案力", "チーム連携"],
    suggestedExpectations: ["後輩への声掛け", "チーム連携強化", "研修への積極的な参加"],
  },
  consultant_candidate: {
    requirements: [
      "ご家族への報告・連絡を担当したことがある",
      "担当者会議に陪席経験がある",
      "ケアマネとのやりとりを経験している",
      "利用者の生活状況を把握している",
      "現場スタッフとご家族・外部機関の橋渡し役を担っている",
      "現場の声を相談業務や外部連携に活かせている",
    ],
    recommendedRoles: ["相談対応", "家族対応", "専門性向上", "接遇向上"],
    suggestedExpectations: [
      "ご家族対応の経験を積む",
      "研修への積極的な参加",
      "医療的ケアの知識を深める",
    ],
  },
  manager_candidate: {
    requirements: [
      "リーダーとしてチームをまとめた経験がある",
      "担当者会議を主導した経験がある",
      "後輩育成に積極的に関わっている",
      "業務改善提案の経験がある",
      "稼働率・請求業務を理解している",
      "チーム内の問題を早期に発見し、解決しようとしている",
      "個人の視点だけでなく、チーム全体を俯瞰して考えられる",
    ],
    recommendedRoles: ["リーダーシップ", "後輩育成", "提案力", "チーム連携", "家族対応"],
    suggestedExpectations: [
      "担当者会議に参加する",
      "後輩指導を担当する",
      "請求業務の流れを覚える",
      "ご家族対応の経験を積む",
      "研修への積極的な参加",
    ],
    philosophy: CROSS_HEART_MANAGER_PHILOSOPHY,
  },
  leader: {
    requirements: [
      "チームの中心として機能している",
      "後輩の相談を受けている",
      "業務の優先度を自分で判断できる",
      "管理者の補佐ができる",
    ],
    recommendedRoles: ["リーダーシップ", "後輩育成", "提案力", "チーム連携"],
    suggestedExpectations: [
      "後輩への声掛け",
      "チーム連携強化",
      "研修への積極的な参加",
      "担当者会議に参加する",
    ],
  },
  manager: {
    requirements: [
      "担当者会議を主導・調整できる",
      "ケアマネ・ご家族対応を独立して行える",
      "後輩育成の仕組みを作った経験がある",
      "稼働率・請求業務を自ら確認している",
      "シフト管理・チーム運営の経験がある",
      "業務改善をチームに展開した経験がある",
    ],
    recommendedRoles: [
      "リーダーシップ",
      "後輩育成",
      "提案力",
      "チーム連携",
      "家族対応",
      "記録改善",
    ],
    suggestedExpectations: [
      "担当者会議に参加する",
      "後輩指導を担当する",
      "請求業務の流れを覚える",
      "ご家族対応の経験を積む",
      "チーム連携強化",
    ],
    philosophy: CROSS_HEART_MANAGER_PHILOSOPHY,
  },
};

export default function ManagerInterviewDetail() {
  const { user } = useAuth();
  const { staffId } = useParams<{ staffId: string }>();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [staffInterview, setStaffInterview] = useState<StaffInterview | null>(null);
  const [past, setPast] = useState<{ si: StaffInterview; mi: ManagerInterview | null }[]>([]);
  const [mi, setMi] = useState<ManagerInterview | null>(null);
  const [growthExpectation, setGrowthExpectation] = useState<GrowthExpectation | null>(null);
  const [growthPath, setGrowthPath] = useState<GrowthPath | null>(null);
  const [periodKey, setPeriodKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  // 面談メモ
  const [strength, setStrength] = useState("");
  const [issue, setIssue] = useState("");
  const [expectation, setExpectation] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [supportPlan, setSupportPlan] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>(EMPTY_EVAL);

  // 期待する役割（タグ）
  const [expectedRoles, setExpectedRoles] = useState<string[]>([]);
  const [customRole, setCustomRole] = useState("");

  // 今期の期待（具体的な行動）
  const [expectationItems, setExpectationItems] = useState<string[]>([]);
  const [newExpectationItem, setNewExpectationItem] = useState("");

  // 成長ステップ（旧GrowthStage方式 — 既存データ参照用。新規書き込み不可）
  const [currentStage, setCurrentStage] = useState<GrowthStage>("stable");
  const [nextStage, setNextStage] = useState<GrowthStage | null>(null);
  const [aspirationNote, setAspirationNote] = useState("");
  const [stageGuideOpen, setStageGuideOpen] = useState(false);
  const [showReflection, setShowReflection] = useState(false);

  // 成長STEP（新方式 — ManagerInterviewに保存）
  const [currentStep, setCurrentStep] = useState<GrowthStep | "">("");
  const [nextStep, setNextStep] = useState<GrowthStep | "">("");

  useEffect(() => {
    if (!staffId) return;
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    setPeriodKey(pk);

    const s = staffStore.get(staffId);
    setStaff(s);
    if (!s) return;

    const si = staffInterviewStore.byStaffAndPeriod(s.id, pk);
    setStaffInterview(si);

    const all = staffInterviewStore.byStaff(s.id);
    const pastList = all
      .filter((x) => x.period !== pk)
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
      .map((x) => ({
        si: x,
        mi: managerInterviewStore.byStaffAndPeriod(s.id, x.period),
      }));
    setPast(pastList);

    const cur = managerInterviewStore.byStaffAndPeriod(s.id, pk);
    if (cur) {
      setMi(cur);
      setStrength(cur.strength);
      setIssue(cur.issue);
      setExpectation(cur.expectation);
      setFollowUp(cur.followUp);
      setSupportPlan(cur.supportPlan ?? "");
      setEvaluation(cur.evaluation);
      setExpectedRoles(cur.expectedRoles ?? []);
      // 新方式STEP: 保存済みがあればそれを、なければStaff.growthStepを初期値に
      setCurrentStep(cur.currentStep ?? s.growthStep ?? "");
      setNextStep(cur.nextStep ?? "");
    } else {
      setMi(null);
      // 新規面談: Staff.growthStepを初期値に
      setCurrentStep(s.growthStep ?? "");
      setNextStep("");
    }

    const ge = growthExpectationStore.byStaffAndPeriod(s.id, pk);
    setGrowthExpectation(ge);
    setExpectationItems(ge?.items ?? []);

    const gp = growthPathStore.byStaff(s.id);
    setGrowthPath(gp);
    if (gp) {
      setCurrentStage(gp.currentStage);
      setNextStage(gp.nextStage);
      setAspirationNote(gp.aspirationNote);
    }
  }, [staffId]);

  const previousGoal = useMemo(() => {
    return past.find((p) => p.mi?.status === "done" && p.mi?.expectation)?.mi;
  }, [past]);

  if (!user || !staff) {
    return (
      <div className="text-ink-400 py-20 text-center">
        職員データが見つかりません。
        <div className="mt-4">
          <Link to="/manager/home" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            戻る
          </Link>
        </div>
      </div>
    );
  }

  const toggleRole = (role: string) => {
    setExpectedRoles((cur) =>
      cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role],
    );
  };

  const addCustomRole = () => {
    const v = customRole.trim();
    if (!v) return;
    if (!expectedRoles.includes(v)) setExpectedRoles([...expectedRoles, v]);
    setCustomRole("");
  };

  const addExpectationItem = (text?: string) => {
    const v = (text ?? newExpectationItem).trim();
    if (!v) return;
    if (!expectationItems.includes(v)) {
      setExpectationItems([...expectationItems, v]);
    }
    if (!text) setNewExpectationItem("");
  };

  const removeExpectationItem = (i: number) => {
    setExpectationItems(expectationItems.filter((_, idx) => idx !== i));
  };

  const save = (status: "in_progress" | "done") => {
    if (!staffInterview) return;
    const now = new Date().toISOString();

    // 管理者面談本体
    const item: ManagerInterview = mi
      ? {
          ...mi,
          strength,
          issue,
          expectation,
          followUp,
          supportPlan,
          evaluation,
          expectedRoles,
          currentStep: (currentStep as GrowthStep) || null,
          nextStep: (nextStep as GrowthStep) || null,
          status,
          interviewedAt: status === "done" ? now : mi.interviewedAt,
        }
      : {
          id: uid("mi"),
          staffInterviewId: staffInterview.id,
          staffId: staff.id,
          managerId: user.id,
          period: periodKey,
          interviewedAt: status === "done" ? now : null,
          strength,
          issue,
          expectation,
          followUp,
          supportPlan,
          expectedRoles,
          evaluation,
          currentStep: (currentStep as GrowthStep) || null,
          nextStep: (nextStep as GrowthStep) || null,
          status,
        };
    managerInterviewStore.upsert(item);
    setMi(item);

    // 今期の期待
    const ge: GrowthExpectation = growthExpectation
      ? {
          ...growthExpectation,
          items: expectationItems,
          setBy: user.id,
          updatedAt: now,
        }
      : {
          id: uid("ge"),
          staffId: staff.id,
          period: periodKey,
          items: expectationItems,
          setBy: user.id,
          updatedAt: now,
        };
    growthExpectationStore.upsert(ge);
    setGrowthExpectation(ge);

    // GrowthPath: aspirationNoteのみ更新。旧currentStage/nextStageは保護。
    if (growthPath) {
      const gp: GrowthPath = { ...growthPath, aspirationNote, updatedAt: now };
      growthPathStore.upsert(gp);
      setGrowthPath(gp);
    } else if (aspirationNote.trim()) {
      // aspirationNoteがある場合のみ新規作成（currentStageはデフォルト値で最小限）
      const gp: GrowthPath = {
        id: uid("gp"),
        staffId: staff.id,
        currentStage,
        nextStage: null,
        aspirationNote,
        updatedAt: now,
      };
      growthPathStore.upsert(gp);
      setGrowthPath(gp);
    }

    if (status === "in_progress") {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setShowReflection(true);
    }
  };

  return (
    <>
      <div className="mb-4">
        <Link
          to={`/manager/staff/${staff.id}`}
          className="text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          職員カルテに戻る
        </Link>
      </div>

      <PageHeader
        title={staff.name}
        subtitle={`${staff.department} ／ ${staff.jobType}（${staff.employmentType}）／ 在籍 ${tenureLabel(staff.joinedAt)}`}
        right={
          mi?.status === "done" ? (
            <StatusBadge label="面談完了" variant="done" />
          ) : staffInterview ? (
            <StatusBadge label="シート提出済" variant="progress" />
          ) : (
            <StatusBadge label="シート未提出" variant="pending" />
          )
        }
      />

      {saved && (
        <div className="bg-sage-500 shadow-soft fixed right-6 bottom-6 z-30 flex items-center gap-2 rounded-full px-4 py-2.5 text-white">
          <CheckCircle2 className="h-4 w-4" />
          下書きを保存しました
        </div>
      )}

      {showReflection && (
        <div className="card bg-warm-50 border-warm-200 fixed inset-x-4 bottom-6 z-30 shadow-lg sm:inset-x-auto sm:right-6 sm:w-80">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-sage-500 h-4 w-4" />
              <span className="text-ink-800 text-sm font-bold">育成計画を確定しました</span>
            </div>
            <button
              type="button"
              onClick={() => setShowReflection(false)}
              className="text-ink-400 hover:text-ink-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-ink-600 space-y-2.5 text-xs leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-warm-400 shrink-0">💡</span>
              <span>
                設定した行動目標は、この職員の<strong>強みとつながっていた</strong>でしょうか？
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-warm-400 shrink-0">💡</span>
              <span>
                半年後のビジョンを、<strong>面談の場で直接伝える</strong>機会を作れそうですか？
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowReflection(false)}
            className="text-ink-400 hover:text-ink-800 mt-3 w-full py-1 text-center text-xs transition"
          >
            閉じる
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：職員の情報 */}
        <div className="space-y-4">
          {previousGoal && (
            <div className="card bg-warm-50 border-warm-100">
              <div className="text-warm-600 mb-2 flex items-center gap-1 text-xs font-bold">
                <MessageCircle className="h-3.5 w-3.5" />
                前回の期待
              </div>
              <div className="text-ink-800 text-sm leading-relaxed">{previousGoal.expectation}</div>
              <div className="text-ink-400 mt-2 text-xs">
                {formatDate(previousGoal.interviewedAt)}
              </div>
            </div>
          )}

          <div className="card border-[#E0E0E0] bg-[#F7F7F7]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 font-bold">職員が記入した内容</h3>
              <span className="text-ink-400 rounded-full border border-[#D0D0D0] bg-white px-2.5 py-0.5 text-[10px] font-medium">
                閲覧のみ
              </span>
            </div>
            <p className="text-ink-400 mb-3 text-xs">管理者は内容を確認してください</p>
            {staffInterview ? (
              <div className="space-y-4 text-sm">
                <AnswerBlock label="最近頑張ったこと" text={staffInterview.effort} />
                <AnswerBlock label="困っていること" text={staffInterview.trouble} />
                <AnswerBlock label="今後伸ばしたいこと" text={staffInterview.growth} />
                <AnswerBlock label="半年後どうなっていたいか" text={staffInterview.vision} />
                {staffInterview.proposal && (
                  <AnswerBlock label="会社・職場への提案" text={staffInterview.proposal} />
                )}
                <div className="text-ink-400 border-cream-200 border-t pt-2 text-xs">
                  提出：{formatDateTime(staffInterview.submittedAt)}
                </div>
              </div>
            ) : (
              <div className="text-ink-400 py-6 text-center text-sm">
                まだ職員が面談シートを提出していません
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="card">
              <h3 className="text-ink-800 mb-3 font-bold">過去の面談履歴</h3>
              <div className="space-y-2">
                {past.map(({ si, mi }) => (
                  <details key={si.id} className="border-cream-200 group rounded-xl border p-3">
                    <summary className="text-ink-800 flex cursor-pointer items-center justify-between text-sm font-medium">
                      <span>{si.period}</span>
                      <span className="text-ink-400 text-xs">{formatDate(si.submittedAt)}</span>
                    </summary>
                    <div className="mt-3 space-y-3 text-sm">
                      <AnswerBlock label="頑張ったこと" text={si.effort} compact />
                      <AnswerBlock label="今後の目標" text={si.growth} compact />
                      {mi?.expectation && (
                        <AnswerBlock label="管理者からの期待" text={mi.expectation} compact />
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：管理者入力 */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="bg-cream-200 h-px flex-1" />
              <span className="text-ink-600 text-xs font-bold tracking-wider whitespace-nowrap">
                管理者が入力する内容
              </span>
              <div className="bg-cream-200 h-px flex-1" />
            </div>
            <p className="text-ink-400 mt-1 text-center text-xs">この面談で育成計画を作成します</p>
          </div>

          {/* 1. 現在のSTEP */}
          <div className="card border-warm-200">
            <h3 className="text-ink-800 mb-1 flex items-center gap-2 font-bold">
              <TrendingUp className="text-sage-500 h-4 w-4" />
              現在のSTEP
            </h3>
            <p className="text-ink-400 mb-4 text-xs">
              この職員が今どの成長段階にいるかを確認してください
            </p>
            {/* 旧GrowthStageデータがある場合のみ参照として表示 */}
            {growthPath && !mi?.currentStep && (
              <div className="text-ink-400 bg-cream-50 border-cream-200 mb-3 rounded-lg border px-3 py-2 text-xs">
                旧記録（ステージ）：
                {GROWTH_STAGES.find((s) => s.value === growthPath.currentStage)?.label ??
                  growthPath.currentStage}
              </div>
            )}
            <StepPicker value={currentStep} onChange={setCurrentStep} />
          </div>

          {/* 2. 強み */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Sparkles className="text-sage-500 h-4 w-4" />
                強み
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <FieldArea
              hint="この職員の良いところ・成長の土台を書いてください"
              value={strength}
              onChange={setStrength}
              guide={GUIDE_STRENGTH}
            />
          </div>

          {/* 3. 一緒に伸ばしていきたいこと */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Target className="text-sage-500 h-4 w-4" />
                一緒に伸ばしていきたいこと
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <FieldArea
              hint="課題としてではなく、これから一緒に育てていきたい力・伸ばしたい方向性を書いてください"
              value={issue}
              onChange={setIssue}
              guide={GUIDE_ISSUE}
            />
          </div>

          {/* 4. 次に目指す姿 */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <TrendingUp className="text-warm-500 h-4 w-4" />
                次に目指す姿
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <p className="text-ink-400 mb-4 text-xs">
              これから、この職員にどんな成長をしてほしいか、本人と一緒に描きましょう。
            </p>
            {nextStage && STAGE_GUIDE[nextStage] && (
              <StageGuidePanel
                nextStage={nextStage}
                guide={STAGE_GUIDE[nextStage]!}
                open={stageGuideOpen}
                onToggle={() => setStageGuideOpen((o) => !o)}
                expectedRoles={expectedRoles}
                onToggleRole={toggleRole}
                expectationItems={expectationItems}
                onAddExpectation={addExpectationItem}
              />
            )}
            <textarea
              className="input-base min-h-[100px] resize-y bg-white/80 leading-relaxed"
              placeholder={
                "例：担当者会議で自分の言葉でご家族に説明している姿を見たい。\nチームの相談役として後輩から頼られる存在になってほしい。"
              }
              value={aspirationNote}
              onChange={(e) => setAspirationNote(e.target.value)}
            />
            <p className="text-ink-400 mt-2 text-[11px] leading-relaxed">
              💡「こんな場面で活躍してほしい」と書くと、本人が成長をイメージしやすくなります
            </p>
          </div>

          {/* 5. 次の半年でやってみること */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Target className="text-warm-500 h-4 w-4" />
                次の半年でやってみること
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <p className="text-ink-400 mb-4 text-xs">
              半年後の姿に向けて、この期間に取り組む具体的な行動を書いてください。半年で実行できる内容に絞ることが大切です。
            </p>

            {expectationItems.length > 0 && (
              <ul className="mb-3 space-y-2">
                {expectationItems.map((item, i) => (
                  <li
                    key={i}
                    className="group flex items-start gap-2 rounded-xl border border-[#C8E6C8] bg-white/70 px-3 py-2"
                  >
                    <div className="bg-sage-500 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                      {i + 1}
                    </div>
                    <div className="text-ink-800 flex-1 text-sm leading-relaxed">{item}</div>
                    <button
                      type="button"
                      onClick={() => removeExpectationItem(i)}
                      className="text-ink-400 transition hover:text-orange-600"
                      aria-label="削除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mb-3 flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="取り組む行動を追加"
                value={newExpectationItem}
                onChange={(e) => setNewExpectationItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExpectationItem();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => addExpectationItem()}
                disabled={!newExpectationItem.trim()}
                className="btn-secondary px-4"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div>
              <div className="text-ink-400 mb-1.5 text-xs">テンプレから追加：</div>
              <div className="flex flex-wrap gap-1.5">
                {EXPECTATION_TEMPLATES.filter((t) => !expectationItems.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addExpectationItem(t)}
                    className="chip text-ink-600 cursor-pointer border border-[#C8E6C8] bg-white/70 transition hover:bg-white"
                  >
                    <Plus className="h-3 w-3" />
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. 会社・管理者から期待していること */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Sparkles className="text-warm-500 h-4 w-4" />
                会社・管理者から期待していること
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <p className="text-ink-400 mb-3 text-xs">
              この職員に担ってほしい役割・会社としての期待を選んでください。
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ROLE_TEMPLATES.map((r) => {
                const active = expectedRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`chip cursor-pointer transition ${
                      active
                        ? "bg-sage-500 text-white"
                        : "text-ink-600 border border-[#C8E6C8] bg-white/70 hover:bg-white"
                    }`}
                  >
                    {active && <CheckCircle2 className="h-3 w-3" />}
                    {r}
                  </button>
                );
              })}
            </div>
            {expectedRoles.filter((r) => !ROLE_TEMPLATES.includes(r)).length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 border-t border-[#C8E6C8] pt-2">
                <div className="text-ink-400 w-full text-xs">カスタム：</div>
                {expectedRoles
                  .filter((r) => !ROLE_TEMPLATES.includes(r))
                  .map((r) => (
                    <span
                      key={r}
                      className="chip bg-sage-500 cursor-pointer text-white"
                      onClick={() => toggleRole(r)}
                    >
                      {r}
                      <X className="h-3 w-3" />
                    </span>
                  ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="独自の役割を追加"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomRole();
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustomRole}
                disabled={!customRole.trim()}
                className="btn-secondary px-4"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 7. 会社・管理者が支援すること */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Heart className="text-sage-500 h-4 w-4" />
                会社・管理者が支援すること
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <p className="text-ink-400 mb-3 text-xs">
              職員の成長のために、会社・管理者が行う支援を具体的に書いてください。「職員に頑張ってもらう」だけでなく、「会社としての約束」を残す欄です。
            </p>
            <FieldArea
              label="支援内容"
              hint="例：認知症ケア研修の案内を優先して伝え、受講できる機会をつくる"
              value={supportPlan}
              onChange={setSupportPlan}
            />
          </div>

          {/* 6. 本人へのメッセージ */}
          <div className="card border-[#C8E6C8] bg-[#F4FBF4]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Heart className="text-warm-500 h-4 w-4" />
                本人へのメッセージ
              </h3>
              <span className="rounded-full border border-[#B8DCBF] bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-medium text-[#2D7A3A]">
                職員ホームへ表示
              </span>
            </div>
            <p className="text-ink-400 mb-3 text-xs">
              本人に伝える応援の言葉を短く書いてください。強みや期待が伝わる一言を意識してください。
            </p>
            <FieldArea
              label="本人へのメッセージ"
              hint="職員ホームに表示されます。ビジョンや行動計画と同じ内容を繰り返さず、一言の応援を届けましょう"
              value={expectation}
              onChange={setExpectation}
              guide={GUIDE_EXPECTATION}
            />
          </div>

          {/* 育成メモ */}
          <div className="card border-[#C8DCF5] bg-[#F3F8FF]">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-ink-800 font-bold">育成メモ</h3>
              <span className="rounded-full border border-[#B8CEFF] bg-[#D0E4FF] px-2 py-0.5 text-[10px] font-medium text-[#2C5FAB]">
                管理者・社長のみ
              </span>
            </div>
            <p className="text-ink-400 mb-3 text-xs">管理者・社長のみ共有</p>
            <FieldArea
              label="育成メモ"
              hint="次回面談までに気を付けたいことや、次の担当者へ引き継ぎたいことを記録します。"
              value={followUp}
              onChange={setFollowUp}
            />
          </div>

          {/* 一次評価：成長面談では非表示。データ・保存処理は維持。将来「人事考課」として独立予定。 */}

          {/* 保存ボタン */}
          {confirmPending ? (
            <div className="card bg-warm-50 border-warm-200">
              <p className="text-ink-800 mb-1 text-sm font-bold">
                この内容で面談記録を確定しますか？
              </p>
              <p className="text-ink-400 mb-4 text-xs">
                本人と一緒に確認した内容になっているか、もう一度ご確認ください。
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirmPending(false)}
                  className="btn-secondary flex-1"
                >
                  戻って確認する
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmPending(false);
                    save("done");
                  }}
                  className="btn-primary flex-1"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  はい、確定します
                </button>
              </div>
            </div>
          ) : (
            <div className="sticky bottom-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => save("in_progress")}
                disabled={!staffInterview}
                className="btn-secondary flex-1"
              >
                <Save className="h-4 w-4" />
                下書き保存
              </button>
              <button
                onClick={() => setConfirmPending(true)}
                disabled={!staffInterview}
                className="btn-primary flex-1"
              >
                <CheckCircle2 className="h-4 w-4" />
                面談内容を確定する
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AnswerBlock({ label, text, compact }: { label: string; text: string; compact?: boolean }) {
  return (
    <div>
      <div className={`text-ink-400 text-xs ${compact ? "" : "mb-1"}`}>{label}</div>
      <div
        className={`text-ink-800 leading-relaxed whitespace-pre-wrap ${compact ? "text-sm" : ""}`}
      >
        {text || "—"}
      </div>
    </div>
  );
}

function FieldArea({
  label,
  hint,
  value,
  onChange,
  guide,
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  guide?: GuideContent;
}) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div>
      {label && <span className="label-base">{label}</span>}
      {hint && <span className="text-ink-400 mb-1.5 block text-xs">{hint}</span>}
      {guide && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setGuideOpen((o) => !o)}
            className="text-ink-400 hover:text-warm-600 flex items-center gap-1 py-0.5 text-xs transition-colors"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${guideOpen ? "rotate-90" : ""}`}
            />
            {guideOpen ? "ガイドを閉じる" : "書き方ガイドを見る"}
          </button>
          {guideOpen && (
            <div className="bg-cream-50 border-cream-200 mt-1.5 space-y-3 rounded-xl border p-3 md:p-4">
              {/* クロスハート面談の3原則 */}
              <div className="bg-warm-50 border-warm-100 rounded-lg border px-3 py-2.5">
                <div className="text-warm-600 mb-2 text-[10px] font-bold tracking-wider">
                  クロスハート面談の3原則
                </div>
                <ol className="space-y-1">
                  {INTERVIEW_PRINCIPLES.map((p, i) => (
                    <li key={i} className="text-warm-700 flex items-start gap-1.5 text-xs">
                      <span className="text-warm-400 shrink-0 font-bold">0{i + 1}</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 目的 */}
              <div>
                <div className="text-ink-400 mb-1 text-[10px] font-bold tracking-wider">
                  このフィールドの目的
                </div>
                <p className="text-ink-600 text-xs leading-relaxed">{guide.purpose}</p>
              </div>

              {/* 良い例 */}
              <div>
                <div className="text-sage-600 mb-1.5 text-[10px] font-bold tracking-wider">
                  ✓ 良い例
                </div>
                <div className="space-y-1.5">
                  {guide.goodExamples.map((ex, i) => (
                    <div
                      key={i}
                      className="bg-sage-50 border-sage-100 text-ink-800 rounded-lg border px-3 py-2 text-xs leading-relaxed"
                    >
                      「{ex}」
                    </div>
                  ))}
                </div>
              </div>

              {/* 避けたい例 */}
              <div>
                <div className="text-warm-500 mb-1.5 text-[10px] font-bold tracking-wider">
                  ✗ 避けたい例
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {guide.badExamples.map((ex, i) => (
                    <span
                      key={i}
                      className="bg-warm-50 border-warm-100 text-warm-700 rounded-full border px-2.5 py-0.5 text-xs"
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </div>

              {/* 書くコツ */}
              <div className="border-cream-200 border-t pt-2">
                <div className="text-ink-400 mb-1 text-[10px] font-bold tracking-wider">
                  書くコツ
                </div>
                <p className="text-ink-600 text-xs leading-relaxed">{guide.tips}</p>
              </div>
            </div>
          )}
        </div>
      )}
      <textarea
        className="input-base min-h-[80px] resize-y leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StageGuidePanel({
  nextStage,
  guide,
  open,
  onToggle,
  expectedRoles,
  onToggleRole,
  expectationItems,
  onAddExpectation,
}: {
  nextStage: GrowthStage;
  guide: StageGuide;
  open: boolean;
  onToggle: () => void;
  expectedRoles: string[];
  onToggleRole: (role: string) => void;
  expectationItems: string[];
  onAddExpectation: (item: string) => void;
}) {
  const nextLabel = GROWTH_STAGES.find((s) => s.value === nextStage)?.label ?? "";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="text-ink-400 hover:text-warm-600 flex items-center gap-1 py-0.5 text-xs transition-colors"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {open ? "育成ガイドを閉じる" : `${nextLabel}に向けた育成ガイドを見る`}
      </button>

      {open && (
        <div className="bg-cream-50 border-cream-200 mt-1.5 space-y-4 rounded-xl border p-3 md:p-4">
          {/* 理念ガイド（管理者系のみ） */}
          {guide.philosophy && (
            <div className="bg-warm-50 border-warm-100 rounded-lg border px-3 py-2.5">
              <div className="text-warm-600 mb-2 text-[10px] font-bold tracking-wider">
                {guide.philosophy.title}
              </div>
              <ul className="space-y-1">
                {guide.philosophy.items.map((item, i) => (
                  <li key={i} className="text-warm-700 flex items-start gap-1.5 text-xs">
                    <span className="text-warm-400 shrink-0">◆</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 到達の目安 */}
          <div>
            <div className="text-ink-400 mb-2 text-[10px] font-bold tracking-wider">
              {nextLabel}到達の目安となる経験・行動
            </div>
            <ul className="space-y-1.5">
              {guide.requirements.map((req, i) => (
                <li key={i} className="text-ink-700 flex items-start gap-2 text-xs">
                  <span className="border-ink-300 mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded border" />
                  <span className="leading-relaxed">{req}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 推奨タグ */}
          <div>
            <div className="text-sage-600 mb-2 text-[10px] font-bold tracking-wider">
              このステージに向けた推奨タグ
            </div>
            <div className="flex flex-wrap gap-1.5">
              {guide.recommendedRoles.map((role) => {
                const active = expectedRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => !active && onToggleRole(role)}
                    className={`chip transition ${
                      active
                        ? "bg-sage-500 cursor-default text-white"
                        : "bg-sage-50 border-sage-200 text-sage-700 hover:bg-sage-100 cursor-pointer border"
                    }`}
                  >
                    {active ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {role}
                  </button>
                );
              })}
            </div>
            <p className="text-ink-400 mt-1.5 text-[10px]">
              クリックで「今後期待する役割」に追加されます
            </p>
          </div>

          {/* 推奨行動目標 */}
          <div>
            <div className="text-warm-500 mb-2 text-[10px] font-bold tracking-wider">
              推奨行動目標（今期の期待に追加できます）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {guide.suggestedExpectations.map((item) => {
                const added = expectationItems.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => !added && onAddExpectation(item)}
                    className={`chip transition ${
                      added
                        ? "bg-warm-500 cursor-default text-white"
                        : "bg-warm-50 border-warm-100 text-warm-700 hover:bg-warm-100 cursor-pointer border"
                    }`}
                  >
                    {added ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {item}
                  </button>
                );
              })}
            </div>
            <p className="text-ink-400 mt-1.5 text-[10px]">
              クリックで「今期の期待」に追加されます
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function EvalRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EvalRank | null;
  onChange: (r: EvalRank) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-ink-800 flex-1 text-sm font-medium">{label}</div>
      <div className="flex gap-1.5">
        {EVAL_RANKS.map((r) => {
          const active = value === r;
          const tone =
            r === "S"
              ? active
                ? "bg-warm-500 text-white border-warm-500"
                : "border-cream-200 hover:bg-warm-50"
              : r === "A"
                ? active
                  ? "bg-warm-200 text-warm-600 border-warm-200"
                  : "border-cream-200 hover:bg-warm-50"
                : r === "B"
                  ? active
                    ? "bg-sage-100 text-sage-600 border-sage-100"
                    : "border-cream-200 hover:bg-sage-50"
                  : active
                    ? "bg-cream-200 text-ink-600 border-cream-200"
                    : "border-cream-200 hover:bg-cream-100";
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className={`h-9 w-9 rounded-full border text-sm font-bold transition ${tone}`}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 成長STEPセレクター（InterviewDetail 内で共用）
function StepPicker({
  value,
  onChange,
  nullable,
}: {
  value: GrowthStep | "";
  onChange: (v: GrowthStep | "") => void;
  nullable?: boolean;
}) {
  return (
    <div className="space-y-2">
      {nullable && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
            value === ""
              ? "bg-cream-100 border-cream-300 text-ink-600 font-medium"
              : "border-cream-200 text-ink-400 hover:border-cream-300 bg-white"
          }`}
        >
          未設定
        </button>
      )}
      {GROWTH_STEP_OPTIONS.map((s) => {
        const isSelected = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition ${
              isSelected
                ? "bg-sage-50 border-sage-400 ring-sage-300 ring-1"
                : "border-cream-200 hover:border-warm-300 bg-white"
            }`}
          >
            <div className={`text-sm font-bold ${isSelected ? "text-sage-800" : "text-ink-800"}`}>
              {s.label}
            </div>
            <div className="text-ink-400 mt-0.5 text-xs leading-relaxed">{s.description}</div>
          </button>
        );
      })}
    </div>
  );
}
