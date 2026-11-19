// 結いナビ - 型定義

export type Role = "staff" | "manager" | "president";

export type Department =
  | "ナーシングホーム結いの心 Honjo"
  | "ショートステイ結いの心"
  | "デイサービス結いの心"
  | "デイサービス梨花"
  | "ケアプラン結い"
  | "訪問看護ステーション結いの心"
  | "厨房"
  | "本部";

export type DepartmentStatus = "active" | "prep";

export interface DepartmentEntry {
  name: Department;
  status: DepartmentStatus;
}

// 正式部署マスタ（社長画面・集計・編集も含めて全画面でここを参照する）
export const DEPARTMENT_MASTER: DepartmentEntry[] = [
  { name: "ナーシングホーム結いの心 Honjo", status: "active" },
  { name: "ショートステイ結いの心", status: "active" },
  { name: "デイサービス結いの心", status: "active" },
  { name: "デイサービス梨花", status: "active" },
  { name: "ケアプラン結い", status: "active" },
  { name: "厨房", status: "active" },
  { name: "本部", status: "active" },
  { name: "訪問看護ステーション結いの心", status: "prep" },
];

export const ALL_DEPARTMENTS: Department[] = DEPARTMENT_MASTER.map((d) => d.name);
export const ACTIVE_DEPARTMENTS: Department[] = DEPARTMENT_MASTER.filter(
  (d) => d.status === "active",
).map((d) => d.name);

export type JobType =
  | "介護職員"
  | "看護職員"
  | "看護師" // 旧データ互換
  | "生活相談員"
  | "ケアマネ"
  | "ケアマネジャー" // 旧データ互換
  | "管理者"
  | "厨房"
  | "事務"
  | "リーダー"; // 旧データ互換

export type EmploymentType =
  | "正社員"
  | "パート"
  | "夜勤専従"
  | "契約社員" // 旧データ互換
  | "嘱託"; // 旧データ互換

export type EmploymentStatus = "在籍中" | "休職中" | "産休・育休中" | "退職予定" | "退職済";

export type Qualification =
  | "介護福祉士"
  | "実務者研修"
  | "初任者研修"
  | "看護師"
  | "准看護師"
  | "ケアマネ"
  | "主任ケアマネ"
  | "理学療法士"
  | "作業療法士"
  | "調理師";

export type GrowthStep = "STEP1" | "STEP2" | "STEP3" | "STEP4" | "STEP5";

export type Position = "一般職" | "主任" | "リーダー" | "管理者";

export interface Staff {
  id: string;
  name: string;
  furigana?: string;
  kinjiroCode?: string;
  email?: string;
  department: Department;
  secondaryDepartments?: Department[];
  jobType: JobType;
  position?: Position; // 職位／職責（未設定可）
  joinedAt: string; // YYYY-MM-DD
  employmentType: EmploymentType;
  employmentStatus?: EmploymentStatus;
  returnDate?: string | null; // 復帰予定日（産休・育休中）
  retirementDate?: string | null; // 退職日（退職予定／退職済）
  qualifications?: Qualification[];
  growthStep?: GrowthStep;
  managerMemo?: string;
  titleLabel?: string; // 表示肩書（自由入力。社長など。未設定時はjobTypeを表示）
  role: Role;
  managerId?: string | null;
  active: boolean;
}

// フォーム表示用の選択肢（仕様の最新値のみを表示）
export const JOB_TYPE_OPTIONS: JobType[] = [
  "介護職員",
  "看護職員",
  "生活相談員",
  "ケアマネ",
  "管理者",
  "厨房",
  "事務",
];

export const POSITION_OPTIONS: Position[] = ["一般職", "主任", "リーダー", "管理者"];

export const EMPLOYMENT_TYPE_OPTIONS: EmploymentType[] = ["正社員", "パート", "夜勤専従"];

export const EMPLOYMENT_STATUS_OPTIONS: EmploymentStatus[] = [
  "在籍中",
  "休職中",
  "産休・育休中",
  "退職予定",
  "退職済",
];

export const QUALIFICATION_OPTIONS: Qualification[] = [
  "介護福祉士",
  "実務者研修",
  "初任者研修",
  "看護師",
  "准看護師",
  "ケアマネ",
  "主任ケアマネ",
  "理学療法士",
  "作業療法士",
  "調理師",
];

export const GROWTH_STEP_OPTIONS: {
  value: GrowthStep;
  label: string;
  description: string;
}[] = [
  {
    value: "STEP1",
    label: "STEP1 基本を身につける",
    description: "支援を受けながら、基本業務を身につける",
  },
  {
    value: "STEP2",
    label: "STEP2 安定して仕事をする",
    description: "一通りの業務を安定して行い、自分で考えて動ける",
  },
  {
    value: "STEP3",
    label: "STEP3 周囲を支える",
    description: "自分の仕事だけでなく、後輩や仲間を支援できる",
  },
  {
    value: "STEP4",
    label: "STEP4 チームを支える",
    description: "周囲を見ながら、チームがうまく動くよう働きかけられる",
  },
  {
    value: "STEP5",
    label: "STEP5 組織を担う",
    description: "部署や会社の視点を持ち、人やチームの成長に責任を持つ",
  },
];

// 兼務部署候補（本部・準備中部署は除外）
export const SECONDARY_DEPARTMENT_OPTIONS: Department[] = ACTIVE_DEPARTMENTS.filter(
  (d) => d !== "本部",
);

export function isRetired(staff: Pick<Staff, "employmentStatus" | "active">): boolean {
  if (staff.employmentStatus === "退職済") return true;
  if (staff.active === false && staff.employmentStatus === undefined) return true;
  return false;
}

// 職員が入力する面談フォーム
export interface StaffInterview {
  id: string;
  staffId: string;
  period: string; // 例: "2026-上期"
  submittedAt: string | null; // ISO
  effort: string;
  trouble: string;
  growth: string;
  vision: string;
  proposal: string;
}

export type EvalRank = "S" | "A" | "B" | "C";

export interface Evaluation {
  rinen: EvalRank | null;
  taiou: EvalRank | null;
  team: EvalRank | null;
  shutai: EvalRank | null;
  sekinin: EvalRank | null;
}

// 管理者の面談記録
export interface ManagerInterview {
  id: string;
  staffInterviewId: string;
  staffId: string;
  managerId: string;
  period: string;
  interviewedAt: string | null;
  strength: string;
  issue: string;
  expectation: string;
  followUp: string;
  expectedRoles?: string[]; // 今後期待する役割（タグ）
  supportPlan?: string; // 会社・管理者が支援すること
  evaluation: Evaluation;
  currentStep?: GrowthStep | null; // 面談時の現在STEP（新方式）
  nextStep?: GrowthStep | null; // 面談時の次に目指すSTEP（新方式）
  status: "not_started" | "in_progress" | "done";
}

// 社長期待度
export type ExpectationLevel = "高" | "中" | "低";

// 育成ランク（needsFollowUpとは別概念。育成上、継続的に見ていく区分）
export type DevelopmentRank = "重点育成" | "通常育成" | "要フォロー";

export const EXPECTATION_LEVEL_OPTIONS: ExpectationLevel[] = ["高", "中", "低"];

export const DEVELOPMENT_RANK_OPTIONS: DevelopmentRank[] = ["重点育成", "通常育成", "要フォロー"];

// 人材ポテンシャル（社長期待度とは別概念。役割の方向性。Phase4追加）
export type TalentPotential =
  | "経営幹部候補"
  | "管理者候補"
  | "主任候補"
  | "リーダー候補"
  | "専門職強化"
  | "現職継続";

export const TALENT_POTENTIAL_OPTIONS: TalentPotential[] = [
  "経営幹部候補",
  "管理者候補",
  "主任候補",
  "リーダー候補",
  "専門職強化",
  "現職継続",
];

// 社長の最終確認
export interface PresidentReview {
  id: string;
  staffId: string;
  period: string;
  reviewedAt: string | null;
  presidentMemo: string;
  finalNote: string;
  compensationNote: string;
  finalEvaluation?: Evaluation; // 社長による最終評価（5項目）
  needsFollowUp?: boolean; // 要フォロー判定（注意・支援が必要な職員）
  followUpReason?: string; // 要フォローの理由・対応案
  status: "pending" | "confirmed";

  // ===== Phase2 追加：人材育成判断（すべて任意・既存データは undefined で安全） =====
  overallRank?: EvalRank; // 総合評価 S/A/B/C
  futureCandidateRole?: string; // 将来候補職（自由入力）
  isManagerCandidate?: boolean; // 管理者候補か
  isPriorityDevelopment?: boolean; // 重点育成対象か
  expectationLevel?: ExpectationLevel; // 社長期待度 高/中/低
  developmentRank?: DevelopmentRank; // 育成ランク

  // ===== Phase2 追加：育成方針 =====
  lackingSkills?: string; // 不足している能力
  nextAssignments?: string; // 次に任せる業務
  developmentPolicy?: string; // 社長の育成方針

  // ===== Phase2 追加：昇給・賞与判断（金額。差額は保存せずUIで自動表示） =====
  prevBaseSalary?: number; // 前回基本給
  currentBaseSalary?: number; // 今回基本給
  prevBonus?: number; // 前回賞与額
  currentBonus?: number; // 今回賞与額
  compensationReason?: string; // 昇給・賞与の判断理由（自由記述・Phase2）

  // ===== Phase4 追加（すべて任意・既存フィールドは温存） =====
  nextAssignmentTags?: string[]; // 次に任せる業務（複数選択。自由入力は nextAssignments に温存）
  salaryReasons?: string[]; // 昇給理由（複数選択）
  bonusReasons?: string[]; // 賞与理由（複数選択）
  presidentMessage?: string; // 社長コメント（本人へ伝えたい言葉）
  talentPotential?: TalentPotential; // 人材ポテンシャル

  // ===== 人事考課最終評価（新フロー。既存データは undefined で安全） =====
  hrAssessmentId?: string; // 紐付く一次考課のID
  hrFinalEvaluation?: HRPresidentEvaluation; // 社長の最終人事考課（5項目）
  hrOverallComment?: string; // 社長総合所見（任意）
}

export interface Period {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

// 今期の期待（職員ごと・期ごと）
export interface GrowthExpectation {
  id: string;
  staffId: string;
  period: string;
  items: string[];
  setBy: string; // staffId of editor
  updatedAt: string;
}

// 成長ステージ（一人につき1レコード、随時更新）
export type GrowthStage =
  | "onboarding"
  | "stable"
  | "contributor"
  | "leader_candidate"
  | "consultant_candidate"
  | "manager_candidate"
  | "leader"
  | "manager";

export const GROWTH_STAGES: {
  value: GrowthStage;
  label: string;
  description: string;
}[] = [
  { value: "onboarding", label: "新人期", description: "業務に慣れていく時期" },
  { value: "stable", label: "一般職安定", description: "一通りの業務を安定してこなせる" },
  { value: "contributor", label: "後輩指導", description: "後輩への声かけ・教育に関わる" },
  { value: "leader_candidate", label: "リーダー候補", description: "小チームの取りまとめを期待" },
  {
    value: "consultant_candidate",
    label: "相談員候補",
    description: "相談業務・ご家族対応を任せたい",
  },
  { value: "manager_candidate", label: "管理者候補", description: "管理職としての準備期" },
  { value: "leader", label: "リーダー", description: "チームを牽引する立場" },
  { value: "manager", label: "管理者", description: "部署運営を担う立場" },
];

export interface GrowthPath {
  id: string;
  staffId: string;
  currentStage: GrowthStage;
  nextStage: GrowthStage | null;
  aspirationNote: string; // 次のステップで期待すること（自由記述）
  updatedAt: string;
}

export const EVAL_LABELS: Record<keyof Evaluation, string> = {
  rinen: "理念理解",
  taiou: "利用者対応・接遇",
  team: "チームワーク",
  shutai: "主体性・改善意識",
  sekinin: "安定勤務・責任感",
};

export const EVAL_RANKS: EvalRank[] = ["S", "A", "B", "C"];

// 人事考課（成長面談とは独立した評価。管理者・社長のみ）
export interface HRAssessment {
  id: string;
  staffId: string;
  managerId: string;
  period: string;
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
  status: "draft" | "confirmed";
  updatedAt: string;
}

// 社長の最終人事考課：評価項目ごとの最終評価と変更理由
export interface HRPresidentItemEval {
  rank: EvalRank | null;
  reason?: string; // 管理者評価から変更した場合の理由
}

export interface HRPresidentEvaluation {
  userCenteredAction: HRPresidentItemEval;
  respectfulInteraction: HRPresidentItemEval;
  teamwork: HRPresidentItemEval;
  initiativeImprovement: HRPresidentItemEval;
  responsibility: HRPresidentItemEval;
}

// 選択肢グループの共通型（複数選択チップ用）
export interface OptionGroup {
  group: string;
  items: string[];
}

// 次に任せる業務（複数選択。Phase4）
export const NEXT_ASSIGNMENT_GROUPS: OptionGroup[] = [
  {
    group: "介護業務",
    items: [
      "新人指導",
      "フロアリーダー",
      "レクリエーション企画",
      "行事企画",
      "入浴担当責任者",
      "排泄ケア担当",
      "送迎責任者",
    ],
  },
  {
    group: "生活相談員業務",
    items: ["契約業務", "利用調整", "ケアマネ対応", "担当者会議参加", "稼働率管理"],
  },
  {
    group: "管理業務",
    items: ["シフト作成", "会議進行", "苦情対応", "職員面談同席", "管理者代行"],
  },
  {
    group: "運営業務",
    items: ["請求業務", "実績入力", "加算管理", "監査準備", "行政提出資料作成"],
  },
];

// 社長育成方針テンプレート（タップで本文に追記。Phase4）
export const DEVELOPMENT_POLICY_GROUPS: OptionGroup[] = [
  {
    group: "リーダー育成",
    items: ["後輩指導経験を積ませる", "チーム運営を経験させる", "フロア責任者を任せる"],
  },
  {
    group: "相談員育成",
    items: ["契約業務習得", "担当者会議参加", "ケアマネ対応強化"],
  },
  {
    group: "管理者育成",
    items: ["シフト作成習得", "稼働率管理習得", "人材育成習得", "苦情対応習得", "会議運営習得"],
  },
  {
    group: "経営視点育成",
    items: ["収支理解", "加算理解", "事業計画参加", "管理者会議参加"],
  },
  {
    group: "専門職強化",
    items: ["医療知識向上", "介護保険知識向上", "資格取得支援", "認知症ケア強化"],
  },
];

// 昇給理由（複数選択。Phase4）
export const SALARY_REASON_OPTIONS: string[] = [
  "後輩指導",
  "リーダー業務",
  "安定勤務",
  "業務改善提案",
  "利用者対応",
  "新業務習得",
  "資格取得",
  "稼働率貢献",
  "管理業務補佐",
  "その他",
];

// 賞与理由（複数選択。Phase4）
export const BONUS_REASON_OPTIONS: string[] = [
  "半年間の総合評価",
  "チーム貢献",
  "利用者満足度向上",
  "稼働率向上への貢献",
  "業務改善",
  "特別功績",
  "皆勤・安定勤務",
  "新規利用者獲得協力",
  "その他",
];

// テンプレート：将来候補職（社長判断・自由入力の補助チップ）
export const FUTURE_ROLE_TEMPLATES: string[] = [
  "主任候補",
  "リーダー候補",
  "管理者候補",
  "生活相談員候補",
  "専門職強化",
  "教育担当",
  "現職継続",
  "要フォロー",
];

// テンプレート：今後期待する役割（タグ）
export const ROLE_TEMPLATES: string[] = [
  "接遇向上",
  "リーダーシップ",
  "後輩育成",
  "安定勤務",
  "提案力",
  "相談対応",
  "チーム連携",
  "専門性向上",
  "家族対応",
  "記録改善",
];

// テンプレート：今期の期待（具体的な行動目標）
export const EXPECTATION_TEMPLATES: string[] = [
  "利用者様との会話を増やす",
  "記録の正確性向上",
  "後輩への声掛け",
  "チーム連携強化",
  "ご家族対応の経験を積む",
  "研修への積極的な参加",
  "安定勤務を継続",
  "夜勤業務の習得",
  "医療的ケアの知識を深める",
  "抱え込まず周囲に頼る",
];
