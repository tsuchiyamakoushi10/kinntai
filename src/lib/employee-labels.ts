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
  CONTRACT: "契約社員",
  PART_TIME: "パート",
};

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
