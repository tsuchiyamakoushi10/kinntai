/**
 * Prisma enum の日本語表記。
 *
 * 「介護福祉士」「初任者研修」など現場で実際に使われる呼称に合わせる。
 * UI には専門用語を出さない方針（CLAUDE.md §3.1）に従って、必要に応じ
 * ここで微調整する。
 */
import type {
  DocumentType,
  EmploymentStatus,
  EmploymentType,
  JobCategory,
  QualificationType,
  ShiftPreferenceStatus,
  ShiftPreferenceType,
  TrainingType,
  WageType,
} from "@prisma/client";

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  CARE_WORKER: "介護職員",
  NURSE: "看護職員",
  LIFE_COUNSELOR: "生活相談員",
  CARE_MANAGER: "ケアマネジャー",
  OFFICE_STAFF: "事務職員",
  OTHER: "その他",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "正社員",
  PART_TIME_INSURED: "パート（社保あり）",
  PART_TIME_UNINSURED: "パート（社保なし）",
};

/**
 * 常勤 (終日勤務) 扱いの雇用形態か。自動シフト生成で「終日埋め」の対象にするかの判定に使う。
 * 正社員 と パート（社保あり）を常勤扱いとする (社保ありは所定時間が長くフル配置可能なため)。
 */
export function isRegularEmployment(t: EmploymentType | null): boolean {
  return t === "FULL_TIME" || t === "PART_TIME_INSURED";
}

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "在籍中",
  ON_LEAVE: "休職中",
  RETIRED: "退職済",
};

export const WAGE_TYPE_LABELS: Record<WageType, string> = {
  HOURLY: "時給",
  MONTHLY: "月給",
};

export const QUALIFICATION_TYPE_LABELS: Record<QualificationType, string> = {
  CARE_WORKER: "介護福祉士",
  INITIAL_TRAINING: "初任者研修",
  PRACTICAL_TRAINING: "実務者研修",
  CHIEF_CARE_WORKER: "主任介護福祉士",
  NURSE: "看護師",
  OTHER: "その他",
};

export const JOB_CATEGORY_OPTIONS: ReadonlyArray<{ value: JobCategory; label: string }> = (
  Object.keys(JOB_CATEGORY_LABELS) as JobCategory[]
).map((v) => ({ value: v, label: JOB_CATEGORY_LABELS[v] }));

export const EMPLOYMENT_TYPE_OPTIONS: ReadonlyArray<{ value: EmploymentType; label: string }> = (
  Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]
).map((v) => ({ value: v, label: EMPLOYMENT_TYPE_LABELS[v] }));

export const WAGE_TYPE_OPTIONS: ReadonlyArray<{ value: WageType; label: string }> = (
  Object.keys(WAGE_TYPE_LABELS) as WageType[]
).map((v) => ({ value: v, label: WAGE_TYPE_LABELS[v] }));

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  RESUME: "履歴書 / 職務経歴書",
  QUALIFICATION_CERT: "資格証",
  PRIVACY_CONSENT: "個人情報同意書",
  EMPLOYMENT_CONTRACT: "雇用契約書",
  LABOR_CONDITIONS_NOTICE: "労働条件通知書",
  TRAINING_CERT: "研修 修了証",
  OTHER: "その他",
};

export const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{ value: DocumentType; label: string }> = (
  Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]
).map((v) => ({ value: v, label: DOCUMENT_TYPE_LABELS[v] }));

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  PAID_SELF: "本人負担",
  COMPANY_PAID: "会社負担",
};

export const TRAINING_TYPE_OPTIONS: ReadonlyArray<{ value: TrainingType; label: string }> = (
  Object.keys(TRAINING_TYPE_LABELS) as TrainingType[]
).map((v) => ({ value: v, label: TRAINING_TYPE_LABELS[v] }));

export const SHIFT_PREFERENCE_TYPE_LABELS: Record<ShiftPreferenceType, string> = {
  REQUESTED_OFF: "希望休",
  PAID_LEAVE: "有給",
  PREFERRED_NIGHT: "夜勤希望",
  UNAVAILABLE: "勤務不可",
};

export const SHIFT_PREFERENCE_TYPE_OPTIONS: ReadonlyArray<{
  value: ShiftPreferenceType;
  label: string;
}> = (Object.keys(SHIFT_PREFERENCE_TYPE_LABELS) as ShiftPreferenceType[]).map((v) => ({
  value: v,
  label: SHIFT_PREFERENCE_TYPE_LABELS[v],
}));

/**
 * 職員がスマホから自分で申請できる種別（希望休・夜勤希望・有給）。
 * 「勤務不可」は管理者が代理入力する運用のため、本人向けの選択肢からは除外する。
 */
export const STAFF_SHIFT_PREFERENCE_TYPES: ReadonlyArray<ShiftPreferenceType> = [
  "REQUESTED_OFF",
  "PREFERRED_NIGHT",
  "PAID_LEAVE",
];

export const STAFF_SHIFT_PREFERENCE_TYPE_OPTIONS: ReadonlyArray<{
  value: ShiftPreferenceType;
  label: string;
}> = STAFF_SHIFT_PREFERENCE_TYPES.map((v) => ({
  value: v,
  label: SHIFT_PREFERENCE_TYPE_LABELS[v],
}));

export const SHIFT_PREFERENCE_STATUS_LABELS: Record<ShiftPreferenceStatus, string> = {
  PENDING: "承認待ち",
  ACCEPTED: "承認済",
  REJECTED: "却下",
};
