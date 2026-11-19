/**
 * 育成面談・人事考課の表示名と選択肢。docs/growth-review.md
 *
 * TODO(結いナビ本体): 結いナビのプログラム (src/types/index.ts / HRAssessmentPage.tsx) を受け取ったら、
 * STEP_A_STANDARDS と各選択肢を本体の文言に差し替える。いまは引き継ぎ資料から作った仮の文言。
 * 選択肢は DB では text で持つため、文言の差し替えにマイグレーションは要らない
 * (ただし既存の記録に入っている古い文言はそのまま残る)。
 */
import type { EvalRank, GrowthStep } from "@prisma/client";

export const GROWTH_STEPS: GrowthStep[] = ["STEP1", "STEP2", "STEP3", "STEP4", "STEP5"];

export const STEP_LABELS: Record<
  GrowthStep,
  { short: string; title: string; description: string }
> = {
  STEP1: {
    short: "STEP1",
    title: "基本を身につける",
    description: "支援を受けながら、基本業務を身につける段階",
  },
  STEP2: {
    short: "STEP2",
    title: "安定して仕事をする",
    description: "一通りの業務を安定して行い、自分で考えて動ける段階",
  },
  STEP3: {
    short: "STEP3",
    title: "周囲を支える",
    description: "自分の仕事だけでなく、後輩や仲間を支援できる段階",
  },
  STEP4: {
    short: "STEP4",
    title: "チームを支える",
    description: "周囲を見ながら、チームがうまく動くよう働きかけられる段階",
  },
  STEP5: {
    short: "STEP5",
    title: "組織を担う",
    description: "部署や会社の視点を持ち、人やチームの成長に責任を持つ段階",
  },
};

export const EVAL_RANKS: EvalRank[] = ["S", "A", "B", "C"];

export const EVAL_RANK_HINTS: Record<EvalRank, string> = {
  S: "期待を大きく上回る",
  A: "期待どおり (このSTEPの目安を満たす)",
  B: "もう少し",
  C: "支援が必要",
};

/** 考課の 5 項目。key は hr_assessments / hr_final_assessments の列名 (camelCase)。 */
export const HR_ITEMS = [
  { key: "userCenteredAction", label: "利用者本位の行動" },
  { key: "respectfulInteraction", label: "接遇" },
  { key: "teamwork", label: "チームワーク" },
  { key: "initiativeImprovement", label: "主体性・改善" },
  { key: "responsibility", label: "責任感" },
] as const;

export type HrKey = (typeof HR_ITEMS)[number]["key"];

/**
 * STEP × 項目ごとの「A 評価の目安」。
 * TODO(結いナビ本体): 仮の文言。本体の STEP_A_STANDARDS (25 通り) に差し替える。
 */
export const STEP_A_STANDARDS: Record<GrowthStep, Record<HrKey, string>> = {
  STEP1: {
    userCenteredAction: "教わった手順を守り、利用者の安全に気を配って介助できる",
    respectfulInteraction: "あいさつ・言葉づかいの基本ができている",
    teamwork: "わからないことを先輩に聞き、報告・連絡・相談ができる",
    initiativeImprovement: "教わったことをメモし、同じ質問をくり返さないよう努めている",
    responsibility: "時間を守り、任された業務を最後までやり切る",
  },
  STEP2: {
    userCenteredAction: "利用者一人ひとりの状態に合わせて介助のしかたを変えられる",
    respectfulInteraction: "利用者・家族に安心感を与える対応が安定してできる",
    teamwork: "自分の業務が終わったら周りの手伝いに入れる",
    initiativeImprovement: "気づいたことを自分から提案できる",
    responsibility: "ミスを隠さず報告し、再発防止まで考えられる",
  },
  STEP3: {
    userCenteredAction: "利用者の思いをくみ取り、ケアの工夫をチームに広げられる",
    respectfulInteraction: "後輩の接遇の手本になっている",
    teamwork: "後輩や仲間が困っているときに声をかけ、支えられる",
    initiativeImprovement: "業務のやり方の改善を自分で考えて実行できる",
    responsibility: "後輩の指導を任され、最後まで責任を持つ",
  },
  STEP4: {
    userCenteredAction: "部署として利用者本位のケアができるよう仕組みを整えられる",
    respectfulInteraction: "苦情や難しい場面でも、部署を代表して対応できる",
    teamwork: "チーム全体の状況を見て、役割分担や声かけで動きを良くできる",
    initiativeImprovement: "部署の課題を見つけ、改善の取り組みを引っぱれる",
    responsibility: "部署の目標に責任を持ち、結果をふり返って次に生かせる",
  },
  STEP5: {
    userCenteredAction: "会社の理念を部署の運営に落とし込み、ケアの質を高め続けられる",
    respectfulInteraction: "地域や関係機関から信頼される対応ができる",
    teamwork: "部署をこえて協力体制をつくれる",
    initiativeImprovement: "会社の視点で新しい取り組みを企画・実行できる",
    responsibility: "人やチームの成長に責任を持ち、次の担い手を育てられる",
  },
};

/** 面談記録: 今後期待する役割。TODO(結いナビ本体): 仮の選択肢 */
export const EXPECTED_ROLE_OPTIONS = [
  "新人の指導係",
  "リーダー補佐",
  "委員会の担当",
  "記録・書類の担当",
  "行事の担当",
  "研修の講師",
] as const;

/** 面談確認: 期待度。TODO(結いナビ本体): 仮の選択肢 */
export const EXPECTATION_LEVEL_OPTIONS = ["高", "中", "低"] as const;

/** 面談確認: 育成区分。TODO(結いナビ本体): 仮の選択肢 */
export const DEVELOPMENT_RANK_OPTIONS = ["重点育成", "通常育成", "要フォロー"] as const;

/** 面談確認: 人材ポテンシャル。TODO(結いナビ本体): 仮の選択肢 */
export const TALENT_POTENTIAL_OPTIONS = [
  "経営幹部候補",
  "管理者候補",
  "リーダー候補",
  "専門職として育成",
  "現状維持",
] as const;

/** 面談確認: 次に任せたいこと。TODO(結いナビ本体): 仮の選択肢 */
export const NEXT_ASSIGNMENT_OPTIONS = [
  "リーダー業務",
  "新人指導",
  "委員会",
  "研修受講",
  "資格取得",
  "他部署の経験",
] as const;

/** 面談確認: 昇給の理由。TODO(結いナビ本体): 仮の選択肢 */
export const SALARY_REASON_OPTIONS = [
  "考課の結果",
  "STEP が上がった",
  "役割が増えた",
  "資格を取った",
  "定期昇給",
] as const;

/** 面談確認: 賞与の理由。TODO(結いナビ本体): 仮の選択肢 */
export const BONUS_REASON_OPTIONS = [
  "考課の結果",
  "業績への貢献",
  "改善の提案・実行",
  "後輩の指導",
  "勤怠が安定",
] as const;

/** 面談シートの質問 (職員向けの言葉づかい) */
export const SHEET_FIELDS = [
  { key: "effort", label: "この半年、がんばったこと" },
  { key: "trouble", label: "困っていること・悩んでいること" },
  { key: "growth", label: "これからできるようになりたいこと" },
  { key: "vision", label: "数年後、どうなっていたいか" },
  { key: "proposal", label: "職場をよくするための提案" },
] as const;

export type SheetKey = (typeof SHEET_FIELDS)[number]["key"];

export const INTERVIEW_STATUS_LABELS = {
  NOT_STARTED: "未着手",
  IN_PROGRESS: "記録中",
  DONE: "完了",
} as const;
