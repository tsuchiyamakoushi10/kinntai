"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "@/yui/router";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Star,
  AlertCircle,
  Target,
  Sparkles,
  Copy,
  MessageCircle,
  IdCard,
  UserRound,
  Crown,
  Award,
  BookOpen,
  Wallet,
} from "lucide-react";
import {
  staffStore,
  staffInterviewStore,
  managerInterviewStore,
  presidentReviewStore,
  growthExpectationStore,
  growthPathStore,
  periodStore,
  uid,
} from "@/yui/storage";
import type {
  Staff,
  StaffInterview,
  ManagerInterview,
  PresidentReview,
  Evaluation,
  EvalRank,
  GrowthExpectation,
  GrowthPath,
  ExpectationLevel,
  DevelopmentRank,
  TalentPotential,
} from "../../types";
import {
  EVAL_LABELS,
  EVAL_RANKS,
  GROWTH_STEP_OPTIONS,
  GROWTH_STAGES,
  EXPECTATION_LEVEL_OPTIONS,
  DEVELOPMENT_RANK_OPTIONS,
  FUTURE_ROLE_TEMPLATES,
  TALENT_POTENTIAL_OPTIONS,
  NEXT_ASSIGNMENT_GROUPS,
  DEVELOPMENT_POLICY_GROUPS,
  SALARY_REASON_OPTIONS,
  BONUS_REASON_OPTIONS,
} from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import EvalBadge from "../../components/EvalBadge";
import GrowthStageView from "../../components/GrowthStageView";
import { formatDate, formatDateTime, tenureLabel } from "../../utils/date";

const EMPTY_EVAL: Evaluation = {
  rinen: null,
  taiou: null,
  team: null,
  shutai: null,
  sekinin: null,
};

export default function PresidentConfirmationDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [manager, setManager] = useState<Staff | null>(null);
  const [si, setSi] = useState<StaffInterview | null>(null);
  const [mi, setMi] = useState<ManagerInterview | null>(null);
  const [pr, setPr] = useState<PresidentReview | null>(null);
  const [growthExpectation, setGrowthExpectation] = useState<GrowthExpectation | null>(null);
  const [growthPath, setGrowthPath] = useState<GrowthPath | null>(null);
  const [periodKey, setPeriodKey] = useState("");
  const [saved, setSaved] = useState(false);

  // 入力フォーム
  const [presidentMemo, setPresidentMemo] = useState("");
  const [finalNote, setFinalNote] = useState("");
  const [compensationNote, setCompensationNote] = useState("");
  const [finalEvaluation, setFinalEvaluation] = useState<Evaluation>(EMPTY_EVAL);
  const [needsFollowUp, setNeedsFollowUp] = useState<boolean | null>(null);
  const [followUpReason, setFollowUpReason] = useState("");

  // Phase2: 人材育成判断
  const [overallRank, setOverallRank] = useState<EvalRank | null>(null);
  const [futureCandidateRole, setFutureCandidateRole] = useState("");
  const [isManagerCandidate, setIsManagerCandidate] = useState<boolean | null>(null);
  const [isPriorityDevelopment, setIsPriorityDevelopment] = useState<boolean | null>(null);
  const [expectationLevel, setExpectationLevel] = useState<ExpectationLevel | null>(null);
  const [developmentRank, setDevelopmentRank] = useState<DevelopmentRank | null>(null);
  // Phase2: 育成方針
  const [lackingSkills, setLackingSkills] = useState("");
  const [nextAssignments, setNextAssignments] = useState("");
  const [developmentPolicy, setDevelopmentPolicy] = useState("");
  // Phase2: 昇給・賞与判断（金額は文字列で保持し、保存時に数値化）
  const [prevBaseSalary, setPrevBaseSalary] = useState("");
  const [currentBaseSalary, setCurrentBaseSalary] = useState("");
  const [prevBonus, setPrevBonus] = useState("");
  const [currentBonus, setCurrentBonus] = useState("");
  const [compensationReason, setCompensationReason] = useState("");
  // Phase4: 複数選択・コメント・人材ポテンシャル
  const [nextAssignmentTags, setNextAssignmentTags] = useState<string[]>([]);
  const [salaryReasons, setSalaryReasons] = useState<string[]>([]);
  const [bonusReasons, setBonusReasons] = useState<string[]>([]);
  const [presidentMessage, setPresidentMessage] = useState("");
  const [talentPotential, setTalentPotential] = useState<TalentPotential | null>(null);

  useEffect(() => {
    if (!staffId) return;
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    setPeriodKey(pk);

    const s = staffStore.get(staffId);
    setStaff(s);
    if (!s) return;
    setManager(s.managerId ? staffStore.get(s.managerId) : null);
    setSi(staffInterviewStore.byStaffAndPeriod(s.id, pk));
    setMi(managerInterviewStore.byStaffAndPeriod(s.id, pk));
    setGrowthExpectation(growthExpectationStore.byStaffAndPeriod(s.id, pk));
    setGrowthPath(growthPathStore.byStaff(s.id));
    const cur = presidentReviewStore.byStaffAndPeriod(s.id, pk);
    if (cur) {
      setPr(cur);
      setPresidentMemo(cur.presidentMemo);
      setFinalNote(cur.finalNote);
      setCompensationNote(cur.compensationNote);
      setFinalEvaluation(cur.finalEvaluation ?? EMPTY_EVAL);
      setNeedsFollowUp(cur.needsFollowUp ?? null);
      setFollowUpReason(cur.followUpReason ?? "");
      // Phase2 フィールドの初期化
      setOverallRank(cur.overallRank ?? null);
      setFutureCandidateRole(cur.futureCandidateRole ?? "");
      setIsManagerCandidate(cur.isManagerCandidate ?? null);
      setIsPriorityDevelopment(cur.isPriorityDevelopment ?? null);
      setExpectationLevel(cur.expectationLevel ?? null);
      setDevelopmentRank(cur.developmentRank ?? null);
      setLackingSkills(cur.lackingSkills ?? "");
      setNextAssignments(cur.nextAssignments ?? "");
      setDevelopmentPolicy(cur.developmentPolicy ?? "");
      setPrevBaseSalary(cur.prevBaseSalary != null ? String(cur.prevBaseSalary) : "");
      setCurrentBaseSalary(cur.currentBaseSalary != null ? String(cur.currentBaseSalary) : "");
      setPrevBonus(cur.prevBonus != null ? String(cur.prevBonus) : "");
      setCurrentBonus(cur.currentBonus != null ? String(cur.currentBonus) : "");
      setCompensationReason(cur.compensationReason ?? "");
      // Phase4 フィールドの初期化
      setNextAssignmentTags(cur.nextAssignmentTags ?? []);
      setSalaryReasons(cur.salaryReasons ?? []);
      setBonusReasons(cur.bonusReasons ?? []);
      setPresidentMessage(cur.presidentMessage ?? "");
      setTalentPotential(cur.talentPotential ?? null);
    }
  }, [staffId]);

  if (!staff) {
    return (
      <div className="text-ink-400 py-20 text-center">
        職員データが見つかりません。
        <div className="mt-4">
          <Link to="/president/staff" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            戻る
          </Link>
        </div>
      </div>
    );
  }

  // サマリー用ラベル（既存データから導出。現在地は成長STEP優先、無ければ成長ステージ）
  const currentLabel =
    (staff.growthStep
      ? GROWTH_STEP_OPTIONS.find((o) => o.value === staff.growthStep)?.label
      : undefined) ??
    (growthPath?.currentStage
      ? GROWTH_STAGES.find((s) => s.value === growthPath.currentStage)?.label
      : undefined) ??
    "—";

  const nextLabel =
    (growthPath?.nextStage
      ? GROWTH_STAGES.find((s) => s.value === growthPath.nextStage)?.label
      : undefined) ?? "—";

  // サマリー用：報酬差額（保存済みprから算出。保存はしない）
  const salaryDiff =
    pr?.prevBaseSalary != null && pr?.currentBaseSalary != null
      ? pr.currentBaseSalary - pr.prevBaseSalary
      : null;
  const bonusDiff =
    pr?.prevBonus != null && pr?.currentBonus != null ? pr.currentBonus - pr.prevBonus : null;

  const copyFromManager = () => {
    if (mi?.evaluation) {
      setFinalEvaluation(mi.evaluation);
    }
  };

  // 複数選択のオン/オフ
  const toggleTag = (v: string, list: string[], set: (next: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // 社長の育成方針：テンプレ文を本文の行として追加/削除（自由入力は保持）
  const togglePolicy = (text: string) => {
    setDevelopmentPolicy((prev) => {
      const lines = prev.split("\n");
      if (lines.includes(text)) return lines.filter((l) => l !== text).join("\n");
      return prev.trim() ? `${prev.replace(/\s*$/, "")}\n${text}` : text;
    });
  };

  const save = (status: "pending" | "confirmed") => {
    const now = new Date().toISOString();
    // Phase2 追加フィールド（新規保存・更新保存の両方で保存する）
    const extra = {
      overallRank: overallRank ?? undefined,
      futureCandidateRole: futureCandidateRole.trim() || undefined,
      isManagerCandidate: isManagerCandidate ?? undefined,
      isPriorityDevelopment: isPriorityDevelopment ?? undefined,
      expectationLevel: expectationLevel ?? undefined,
      developmentRank: developmentRank ?? undefined,
      lackingSkills: lackingSkills.trim() || undefined,
      nextAssignments: nextAssignments.trim() || undefined,
      developmentPolicy: developmentPolicy.trim() || undefined,
      prevBaseSalary: parseAmount(prevBaseSalary),
      currentBaseSalary: parseAmount(currentBaseSalary),
      prevBonus: parseAmount(prevBonus),
      currentBonus: parseAmount(currentBonus),
      compensationReason: compensationReason.trim() || undefined,
      // Phase4
      nextAssignmentTags: nextAssignmentTags.length ? nextAssignmentTags : undefined,
      salaryReasons: salaryReasons.length ? salaryReasons : undefined,
      bonusReasons: bonusReasons.length ? bonusReasons : undefined,
      presidentMessage: presidentMessage.trim() || undefined,
      talentPotential: talentPotential ?? undefined,
    };
    const item: PresidentReview = pr
      ? {
          ...pr,
          presidentMemo,
          finalNote,
          compensationNote,
          finalEvaluation,
          needsFollowUp: needsFollowUp ?? undefined,
          followUpReason: needsFollowUp ? followUpReason : "",
          ...extra,
          status,
          reviewedAt: status === "confirmed" ? now : pr.reviewedAt,
        }
      : {
          id: uid("pr"),
          staffId: staff.id,
          period: periodKey,
          reviewedAt: status === "confirmed" ? now : null,
          presidentMemo,
          finalNote,
          compensationNote,
          finalEvaluation,
          needsFollowUp: needsFollowUp ?? undefined,
          followUpReason: needsFollowUp ? followUpReason : "",
          ...extra,
          status,
        };
    presidentReviewStore.upsert(item);
    setPr(item);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

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
        subtitle={`${staff.department} ／ ${staff.jobType} ／ 在籍 ${tenureLabel(staff.joinedAt)} ／ 管理者：${manager?.name ?? "—"}`}
        right={
          pr?.status === "confirmed" ? (
            <StatusBadge label="社長確認済" variant="done" />
          ) : (
            <StatusBadge label="未確認" variant="pending" />
          )
        }
      />

      {saved && (
        <div className="bg-sage-500 shadow-soft fixed right-6 bottom-6 z-30 flex animate-pulse items-center gap-2 rounded-full px-5 py-3 text-white">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">保存しました</span>
        </div>
      )}

      <div className="space-y-6">
        {/* 1. 人材カルテサマリー */}
        <section className="space-y-3">
          <SectionHeading
            num={1}
            title="人材カルテサマリー"
            icon={<IdCard className="text-warm-500 h-4 w-4" />}
          />
          <div className="card from-warm-50 to-cream-50 border-warm-100 bg-gradient-to-br">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-ink-800 text-lg font-bold">{staff.name}</div>
                <div className="text-ink-500 mt-0.5 text-sm">
                  {staff.department} ／ {staff.jobType}
                  {staff.position ? ` ／ ${staff.position}` : ""}
                </div>
              </div>
              {pr?.needsFollowUp === true ? (
                <span className="chip bg-warm-500 inline-flex items-center gap-1 text-white">
                  <AlertCircle className="h-3 w-3" />
                  要フォロー
                </span>
              ) : pr?.needsFollowUp === false ? (
                <span className="chip bg-sage-100 text-sage-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  問題なし
                </span>
              ) : (
                <span className="chip bg-cream-100 text-ink-400">フォロー未判定</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
              <SummaryItem label="現在地" value={currentLabel} />
              <SummaryItem label="次のステップ" value={nextLabel} />
              <SummaryItem
                label="昇給・賞与判断メモ"
                value={pr?.compensationNote?.trim() ? "記入あり" : "なし"}
              />
            </div>

            <div className="border-warm-100 mt-4 border-t pt-3">
              <div className="text-ink-400 mb-2 text-xs">育成判断</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
                <SummaryItem label="将来候補職" value={pr?.futureCandidateRole} />
                <SummaryItem label="管理者候補" value={yesNoLabel(pr?.isManagerCandidate)} />
                <SummaryItem label="社長期待度" value={pr?.expectationLevel} />
                <SummaryItem label="育成ランク" value={pr?.developmentRank} />
                <SummaryItem label="重点育成対象" value={yesNoLabel(pr?.isPriorityDevelopment)} />
                <SummaryItem label="総合評価" value={pr?.overallRank} />
              </div>
            </div>

            <div className="border-warm-100 mt-4 border-t pt-3">
              <div className="text-ink-400 mb-2 text-xs">報酬判断</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <SummaryItem
                  label="昇給額"
                  value={salaryDiff != null ? formatSignedYen(salaryDiff) : undefined}
                />
                <SummaryItem
                  label="賞与増減額"
                  value={bonusDiff != null ? formatSignedYen(bonusDiff) : undefined}
                />
              </div>
            </div>

            <div className="border-warm-100 mt-4 border-t pt-3">
              <div className="text-ink-400 mb-2 text-xs">社長評価</div>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(EVAL_LABELS) as (keyof Evaluation)[]).map((key) => (
                  <div key={key} className="flex flex-col items-center gap-1.5">
                    <EvalBadge rank={pr?.finalEvaluation?.[key] ?? null} size="md" />
                    <div className="text-ink-500 text-center text-[10px] leading-tight">
                      {EVAL_LABELS[key]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. 職員基本情報 */}
        <section className="space-y-3">
          <SectionHeading
            num={2}
            title="職員基本情報"
            icon={<UserRound className="text-warm-500 h-4 w-4" />}
          />
          <div className="card">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
              <InfoItem label="部署" value={staff.department} />
              <InfoItem label="職種" value={staff.jobType} />
              <InfoItem label="職位" value={staff.position} />
              <InfoItem label="雇用形態" value={staff.employmentType} />
              <InfoItem label="入職日" value={formatDate(staff.joinedAt)} />
              <InfoItem label="在籍年数" value={tenureLabel(staff.joinedAt)} />
              <InfoItem label="在籍状況" value={staff.employmentStatus ?? "在籍中"} />
              <InfoItem
                label="成長STEP"
                value={
                  staff.growthStep
                    ? (GROWTH_STEP_OPTIONS.find((o) => o.value === staff.growthStep)?.label ??
                      staff.growthStep)
                    : undefined
                }
              />
              <InfoItem label="担当管理者" value={manager?.name} />
            </div>
            <div className="border-cream-200 mt-4 border-t pt-3">
              <div className="text-ink-400 mb-1.5 text-xs">資格</div>
              {staff.qualifications && staff.qualifications.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {staff.qualifications.map((q) => (
                    <span key={q} className="chip bg-sage-100 text-sage-600">
                      {q}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-ink-800 text-sm">—</div>
              )}
            </div>
          </div>
        </section>

        {/* 3. 本人の声 */}
        <section className="space-y-3">
          <SectionHeading
            num={3}
            title="本人の声"
            icon={<MessageCircle className="text-warm-500 h-4 w-4" />}
          />
          <div className="card">
            {si ? (
              <div className="space-y-3 text-sm">
                <AnswerBlock label="最近頑張ったこと" text={si.effort} />
                <AnswerBlock label="困っていること" text={si.trouble} />
                <AnswerBlock label="今後伸ばしたいこと" text={si.growth} />
                <AnswerBlock label="半年後どうなっていたいか" text={si.vision} />
                <AnswerBlock label="会社・職場への提案" text={si.proposal} />
                <div className="text-ink-400 border-cream-200 border-t pt-2 text-xs">
                  提出：{formatDateTime(si.submittedAt)}
                </div>
              </div>
            ) : (
              <div className="text-ink-400 py-6 text-center text-sm">
                職員からの面談シートはまだ提出されていません
              </div>
            )}
          </div>
        </section>

        {/* 4. 管理者の見立て */}
        <section className="space-y-3">
          <SectionHeading
            num={4}
            title="管理者の見立て"
            icon={<Star className="text-warm-500 h-4 w-4" />}
          />
          <div className="card">
            {/* 一次評価（先頭・大きめ） */}
            <div className="bg-cream-50 border-cream-100 mb-4 rounded-2xl border p-4">
              <div className="text-ink-800 mb-3 text-sm font-bold">一次評価（管理者）</div>
              <div className="grid grid-cols-5 gap-2 md:gap-3">
                {(Object.keys(EVAL_LABELS) as (keyof Evaluation)[]).map((key) => {
                  const rank = mi?.evaluation[key] ?? null;
                  return (
                    <div
                      key={key}
                      className="border-cream-100 flex flex-col items-center gap-2 rounded-xl border bg-white p-2 md:p-3"
                    >
                      {rank ? (
                        <EvalBadge rank={rank} size="lg" />
                      ) : (
                        <span className="bg-cream-100 text-ink-400 inline-flex h-12 w-12 items-center justify-center rounded-full text-center text-[11px] leading-tight font-bold">
                          未評価
                        </span>
                      )}
                      <div className="text-ink-600 text-center text-[11px] leading-tight md:text-xs">
                        {EVAL_LABELS[key]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {/* 管理者コメント（mi の有無に関わらず項目ごとに常時表示。空は「—」） */}
              <div>
                <div className="text-ink-800 mb-3 text-sm font-medium">管理者コメント</div>
                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                  <AnswerBlock label="強み" text={mi?.strength ?? ""} />
                  <AnswerBlock label="課題" text={mi?.issue ?? ""} />
                  <AnswerBlock label="今後期待すること" text={mi?.expectation ?? ""} />
                  <AnswerBlock label="フォローが必要なこと" text={mi?.followUp ?? ""} />
                </div>
              </div>

              {/* 今後期待する役割 */}
              <div className="border-cream-200 border-t pt-4">
                <div className="text-ink-800 mb-2 text-sm font-medium">今後期待する役割</div>
                {mi?.expectedRoles && mi.expectedRoles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {mi.expectedRoles.map((r) => (
                      <span key={r} className="chip bg-warm-500 text-white">
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-ink-800 text-sm">—</div>
                )}
              </div>

              <div className="text-ink-400 border-cream-200 border-t pt-2 text-xs">
                面談実施：
                {mi?.interviewedAt ? formatDateTime(mi.interviewedAt) : "未実施"}
                {" ／ "}管理者：{manager?.name ?? "—"}
              </div>
            </div>

            {/* 今期の期待（役割の直下に集約） */}
            <div className="border-cream-200 mt-4 border-t pt-4">
              <div className="text-ink-800 mb-3 flex items-center gap-2 text-sm font-medium">
                <Target className="text-warm-500 h-4 w-4" />
                今期の期待
              </div>
              {growthExpectation && growthExpectation.items.length > 0 ? (
                <ul className="space-y-2">
                  {growthExpectation.items.map((item, i) => (
                    <li
                      key={i}
                      className="bg-warm-50 border-warm-100 flex items-start gap-2 rounded-xl border px-3 py-2"
                    >
                      <div className="bg-warm-500 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                        {i + 1}
                      </div>
                      <div className="text-ink-800 text-sm leading-relaxed">{item}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-ink-400 py-4 text-center text-sm">
                  今期の期待は設定されていません
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 5. 成長ステップ */}
        <section className="space-y-3">
          <SectionHeading
            num={5}
            title="成長ステップ"
            icon={<Sparkles className="text-warm-500 h-4 w-4" />}
          />
          <GrowthStageView path={growthPath} emptyText="成長ステップは設定されていません" />
        </section>

        {/* 6. 社長判断 */}
        <section className="space-y-4">
          <SectionHeading
            num={6}
            title="社長判断"
            icon={<Crown className="text-warm-500 h-4 w-4" />}
          />

          {/* 社長最終評価 */}
          <div className="card">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-ink-800 flex items-center gap-2 font-bold">
                <Star className="text-warm-500 h-4 w-4" />
                社長最終評価
              </h3>
              {mi && (
                <button
                  type="button"
                  onClick={copyFromManager}
                  className="text-warm-600 hover:text-warm-700 inline-flex items-center gap-1 text-xs hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  管理者評価を反映する
                </button>
              )}
            </div>
            <p className="text-ink-400 mb-4 text-xs">
              管理者の一次評価を踏まえ、社長として最終的な評価を入力します。
            </p>
            {mi ? (
              <div className="space-y-3">
                {(Object.keys(EVAL_LABELS) as (keyof Evaluation)[]).map((key) => (
                  <EvalRowEditor
                    key={key}
                    label={EVAL_LABELS[key]}
                    managerRank={mi.evaluation[key]}
                    value={finalEvaluation[key]}
                    onChange={(v) => setFinalEvaluation((prev) => ({ ...prev, [key]: v }))}
                  />
                ))}
              </div>
            ) : (
              <div className="text-ink-400 py-4 text-center text-sm">
                管理者の一次評価が入力されてから設定できます
              </div>
            )}
          </div>

          {/* 要フォロー判定 */}
          <div className="card">
            <h3 className="text-ink-800 mb-1 flex items-center gap-2 font-bold">
              <AlertCircle className="text-warm-500 h-4 w-4" />
              要フォロー判定
            </h3>
            <p className="text-ink-400 mb-4 text-xs">
              この職員さんに特別なフォローが必要かどうかを判定します。社長ダッシュボードの「要フォロー職員」に反映されます。
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNeedsFollowUp(false)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition ${
                  needsFollowUp === false
                    ? "border-sage-500 bg-sage-50 text-sage-600"
                    : "border-cream-200 text-ink-600 hover:bg-cream-50 bg-white"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                問題なし
              </button>
              <button
                type="button"
                onClick={() => setNeedsFollowUp(true)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition ${
                  needsFollowUp === true
                    ? "border-warm-500 bg-warm-50 text-warm-600"
                    : "border-cream-200 text-ink-600 hover:bg-cream-50 bg-white"
                }`}
              >
                <AlertCircle className="h-4 w-4" />
                要フォロー
              </button>
            </div>
            {needsFollowUp === true && (
              <label className="block">
                <span className="label-base">フォローの理由・対応案</span>
                <span className="text-ink-400 mb-1.5 block text-xs">
                  どんな対応が必要か、書き留めておきましょう（社内共有用）
                </span>
                <textarea
                  className="input-base min-h-[80px] resize-y leading-relaxed"
                  value={followUpReason}
                  onChange={(e) => setFollowUpReason(e.target.value)}
                  placeholder="例：業務量の偏りを来月再点検する。1on1を2週間に1回設定。"
                />
              </label>
            )}
            {needsFollowUp === null && (
              <p className="text-ink-400 text-xs">まだ判定されていません</p>
            )}
          </div>

          {/* 人材育成判断（Phase2 追加） */}
          <div className="card">
            <h3 className="text-ink-800 mb-3 flex items-center gap-2 font-bold">
              <Award className="text-warm-500 h-4 w-4" />
              人材育成判断
            </h3>
            <div className="divide-cream-100 divide-y">
              <ChoiceRow
                label="総合評価"
                options={EVAL_RANKS}
                value={overallRank}
                onChange={setOverallRank}
              />

              <div className="py-3">
                <span className="label-base">将来候補職</span>
                <input
                  type="text"
                  className="input-base"
                  value={futureCandidateRole}
                  onChange={(e) => setFutureCandidateRole(e.target.value)}
                  placeholder="例：リーダー候補 / 生活相談員候補"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FUTURE_ROLE_TEMPLATES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFutureCandidateRole(t)}
                      className={`chip transition ${
                        futureCandidateRole === t
                          ? "bg-warm-500 text-white"
                          : "bg-cream-100 text-ink-600 hover:bg-warm-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <YesNoRow
                label="管理者候補か"
                value={isManagerCandidate}
                onChange={setIsManagerCandidate}
              />
              <YesNoRow
                label="重点育成対象か"
                value={isPriorityDevelopment}
                onChange={setIsPriorityDevelopment}
              />
              <ChoiceRow
                label="社長期待度"
                options={EXPECTATION_LEVEL_OPTIONS}
                value={expectationLevel}
                onChange={setExpectationLevel}
              />
              <ChoiceRow
                label="人材ポテンシャル"
                hint="将来どの役割を担えるか（役割の方向性）。社長期待度（高/中/低・期待の強さ）とは別軸です。"
                options={TALENT_POTENTIAL_OPTIONS}
                value={talentPotential}
                onChange={setTalentPotential}
              />
              <ChoiceRow
                label="育成ランク"
                hint="「育成上、継続的に見ていく」区分です。上の【要フォロー判定】（注意・支援が必要な職員）とは別物です。"
                options={DEVELOPMENT_RANK_OPTIONS}
                value={developmentRank}
                onChange={setDevelopmentRank}
              />
            </div>
          </div>

          {/* 育成方針（Phase2 追加） */}
          <div className="card">
            <h3 className="text-ink-800 mb-3 flex items-center gap-2 font-bold">
              <BookOpen className="text-warm-500 h-4 w-4" />
              育成方針
            </h3>
            <div className="space-y-4">
              <label className="block">
                <span className="label-base">不足している能力</span>
                <textarea
                  className="input-base min-h-[70px] resize-y leading-relaxed"
                  value={lackingSkills}
                  onChange={(e) => setLackingSkills(e.target.value)}
                  placeholder="例：記録の正確性、後輩への指導力"
                />
              </label>
              <div>
                <span className="label-base">次に任せる業務</span>
                <div className="mt-1.5 mb-2">
                  <MultiSelectChips
                    groups={NEXT_ASSIGNMENT_GROUPS}
                    selected={nextAssignmentTags}
                    onToggle={(v) => toggleTag(v, nextAssignmentTags, setNextAssignmentTags)}
                  />
                </div>
                <textarea
                  className="input-base min-h-[60px] resize-y leading-relaxed"
                  value={nextAssignments}
                  onChange={(e) => setNextAssignments(e.target.value)}
                  placeholder="その他（自由入力）"
                />
              </div>
              <div>
                <span className="label-base">社長の育成方針</span>
                <div className="mt-1.5 mb-2">
                  <MultiSelectChips
                    groups={DEVELOPMENT_POLICY_GROUPS}
                    selected={developmentPolicy.split("\n")}
                    onToggle={togglePolicy}
                  />
                </div>
                <textarea
                  className="input-base min-h-[80px] resize-y leading-relaxed"
                  value={developmentPolicy}
                  onChange={(e) => setDevelopmentPolicy(e.target.value)}
                  placeholder="テンプレートをタップで追記、または自由入力"
                />
              </div>
            </div>
          </div>

          {/* 昇給・賞与判断（Phase2 追加） */}
          <div className="card">
            <h3 className="text-ink-800 mb-1 flex items-center gap-2 font-bold">
              <Wallet className="text-warm-500 h-4 w-4" />
              昇給・賞与判断
            </h3>
            <p className="text-ink-400 mb-4 text-xs">
              前回・今回の金額を入力すると差額を自動表示します（差額は保存しません）。上の「昇給・賞与判断メモ」は補足メモとして引き続き使えます。
            </p>
            <div className="space-y-4">
              <div>
                <div className="text-ink-800 mb-2 text-sm font-medium">基本給</div>
                <div className="grid grid-cols-2 gap-3">
                  <NumField
                    label="前回基本給"
                    value={prevBaseSalary}
                    onChange={setPrevBaseSalary}
                  />
                  <NumField
                    label="今回基本給"
                    value={currentBaseSalary}
                    onChange={setCurrentBaseSalary}
                  />
                </div>
                <DiffLine label="昇給額" prev={prevBaseSalary} cur={currentBaseSalary} />
              </div>
              <div>
                <span className="label-base">昇給理由（複数選択）</span>
                <div className="mt-1.5">
                  <MultiSelectChips
                    options={SALARY_REASON_OPTIONS}
                    selected={salaryReasons}
                    onToggle={(v) => toggleTag(v, salaryReasons, setSalaryReasons)}
                  />
                </div>
              </div>
              <div>
                <div className="text-ink-800 mb-2 text-sm font-medium">賞与</div>
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="前回賞与額" value={prevBonus} onChange={setPrevBonus} />
                  <NumField label="今回賞与額" value={currentBonus} onChange={setCurrentBonus} />
                </div>
                <DiffLine label="賞与増減額" prev={prevBonus} cur={currentBonus} />
              </div>
              <div>
                <span className="label-base">賞与理由（複数選択）</span>
                <div className="mt-1.5">
                  <MultiSelectChips
                    options={BONUS_REASON_OPTIONS}
                    selected={bonusReasons}
                    onToggle={(v) => toggleTag(v, bonusReasons, setBonusReasons)}
                  />
                </div>
              </div>
              <label className="block">
                <span className="label-base">判断理由（補足・自由記述）</span>
                <textarea
                  className="input-base min-h-[70px] resize-y leading-relaxed"
                  value={compensationReason}
                  onChange={(e) => setCompensationReason(e.target.value)}
                  placeholder="例：安定勤務と後輩指導を評価し昇給。賞与は通常査定。"
                />
              </label>
              <label className="block">
                <span className="label-base">社長コメント（本人へ伝えたい言葉）</span>
                <textarea
                  className="input-base min-h-[70px] resize-y leading-relaxed"
                  value={presidentMessage}
                  onChange={(e) => setPresidentMessage(e.target.value)}
                  placeholder="例：いつも丁寧な対応をありがとう。来期はチームを引っ張る存在を期待しています。"
                />
              </label>
            </div>
          </div>

          {/* 社長メモ・最終確認 */}
          <div className="card">
            <h3 className="text-ink-800 mb-3 font-bold">社長メモ・最終確認</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="label-base">社長メモ</span>
                <span className="text-ink-400 mb-1.5 block text-xs">
                  社長として気づいたこと、本人に直接伝えたいこと
                </span>
                <textarea
                  className="input-base min-h-[80px] resize-y leading-relaxed"
                  value={presidentMemo}
                  onChange={(e) => setPresidentMemo(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label-base">最終確認メモ</span>
                <span className="text-ink-400 mb-1.5 block text-xs">
                  組織として今後どう関わるか、定着・育成方針など
                </span>
                <textarea
                  className="input-base min-h-[80px] resize-y leading-relaxed"
                  value={finalNote}
                  onChange={(e) => setFinalNote(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label-base">昇給・賞与判断メモ</span>
                <span className="text-ink-400 mb-1.5 block text-xs">
                  ※ 第1版では自動計算しません。判断材料を残す欄です
                </span>
                <textarea
                  className="input-base min-h-[80px] resize-y leading-relaxed"
                  value={compensationNote}
                  onChange={(e) => setCompensationNote(e.target.value)}
                />
              </label>
            </div>
            {pr?.reviewedAt && (
              <div className="text-ink-400 border-cream-200 mt-4 border-t pt-3 text-xs">
                最終確認：{formatDateTime(pr.reviewedAt)}
              </div>
            )}
          </div>
        </section>

        <div className="sticky bottom-4 flex flex-col justify-end gap-3 sm:flex-row">
          <button onClick={() => save("pending")} className="btn-secondary">
            <Save className="h-4 w-4" />
            下書き保存
          </button>
          <button onClick={() => save("confirmed")} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" />
            最終確認として保存
          </button>
        </div>
      </div>
    </>
  );
}

function SectionHeading({ num, title, icon }: { num: number; title: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="bg-warm-500 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
        {num}
      </span>
      <h2 className="text-ink-800 flex items-center gap-2 text-base font-bold">
        {icon}
        {title}
      </h2>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-ink-400 mb-0.5 text-xs">{label}</div>
      <div className="text-ink-800 font-medium">{value || "—"}</div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-ink-400 mb-0.5 text-xs">{label}</div>
      <div className="text-ink-800 font-medium">{value || "—"}</div>
    </div>
  );
}

function AnswerBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-ink-400 mb-1 text-xs">{label}</div>
      <div className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">{text || "—"}</div>
    </div>
  );
}

function EvalRowEditor({
  label,
  value,
  managerRank,
  onChange,
}: {
  label: string;
  value: EvalRank | null;
  managerRank: EvalRank | null;
  onChange: (r: EvalRank) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <div className="text-ink-800 text-sm font-medium">{label}</div>
        <div className="text-ink-400 text-[10px]">
          管理者：<span className="font-bold">{managerRank ?? "—"}</span>
        </div>
      </div>
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

// 金額文字列を数値へ。カンマ・空白は除去。空・不正は undefined（保存しない／0と未入力を区別）
function parseAmount(s: string): number | undefined {
  const t = s.replace(/[,，\s]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// boolean を「はい／いいえ」へ。未設定は undefined（サマリーで「—」表示）
function yesNoLabel(v?: boolean): string | undefined {
  if (v === undefined || v === null) return undefined;
  return v ? "はい" : "いいえ";
}

// 差額を符号付き金額へ（＋5,000円／▲5,000円／±0円）
function formatSignedYen(n: number): string {
  const sign = n > 0 ? "＋" : n < 0 ? "▲" : "±";
  return `${sign}${Math.abs(n).toLocaleString("ja-JP")}円`;
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-ink-800 text-sm font-medium">{label}</div>
        {hint && (
          <div className="text-ink-400 mt-0.5 max-w-md text-[11px] leading-relaxed">{hint}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`h-9 rounded-full border px-3 text-sm font-medium transition ${
                active
                  ? "bg-warm-500 border-warm-500 text-white"
                  : "border-cream-200 text-ink-600 hover:bg-warm-50 bg-white"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelectChips({
  groups,
  options,
  selected,
  onToggle,
}: {
  groups?: { group: string; items: string[] }[];
  options?: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const chip = (item: string) => {
    const active = selected.includes(item);
    return (
      <button
        key={item}
        type="button"
        onClick={() => onToggle(item)}
        className={`chip transition ${
          active ? "bg-warm-500 text-white" : "bg-cream-100 text-ink-600 hover:bg-warm-50"
        }`}
      >
        {item}
      </button>
    );
  };
  if (groups) {
    return (
      <div className="space-y-2.5">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="text-ink-400 mb-1 text-[11px]">{g.group}</div>
            <div className="flex flex-wrap gap-1.5">{g.items.map(chip)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <div className="flex flex-wrap gap-1.5">{(options ?? []).map(chip)}</div>;
}

function YesNoRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <ChoiceRow
      label={label}
      hint={hint}
      options={["はい", "いいえ"] as const}
      value={value === null ? null : value ? "はい" : "いいえ"}
      onChange={(v) => onChange(v === "はい")}
    />
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-ink-400 mb-1 block text-xs">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        className="input-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例：250,000"
      />
    </label>
  );
}

function DiffLine({ label, prev, cur }: { label: string; prev: string; cur: string }) {
  const p = parseAmount(prev);
  const c = parseAmount(cur);
  if (p === undefined || c === undefined) {
    return (
      <div className="text-ink-400 mt-2 text-xs">{label}：—（前回・今回を入力すると自動計算）</div>
    );
  }
  const diff = c - p;
  const sign = diff > 0 ? "+" : "";
  const tone = diff > 0 ? "text-sage-600" : diff < 0 ? "text-warm-600" : "text-ink-500";
  return (
    <div className={`mt-2 text-sm font-bold ${tone}`}>
      {label}：{sign}
      {diff.toLocaleString("ja-JP")}円
    </div>
  );
}
