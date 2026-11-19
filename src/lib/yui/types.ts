/**
 * 結いナビ (育成面談・人事考課) のサーバー ⇔ 画面のやりとりの型。docs/growth-review.md
 * 記録そのものの型は結いナビの型 (src/yui/types) をそのまま使う。
 */
import type {
  GrowthExpectation,
  GrowthPath,
  HRAssessment,
  ManagerInterview,
  Period,
  PresidentReview,
  Role,
  Staff,
  StaffInterview,
} from "@/yui/types";

/** 職員以外の記録の種類 (yui_records.kind) */
export const YUI_RECORD_KINDS = [
  "staffInterview",
  "managerInterview",
  "presidentReview",
  "growthExpectation",
  "growthPath",
  "hrAssessment",
  "period",
] as const;
export type YuiRecordKind = (typeof YUI_RECORD_KINDS)[number];
export type YuiKind = YuiRecordKind | "staff";

/** 画面を開いたときに渡す「見てよい範囲のデータ」 */
export interface YuiSnapshot {
  meId: string;
  staff: Staff[];
  staffInterviews: StaffInterview[];
  managerInterviews: ManagerInterview[];
  presidentReviews: PresidentReview[];
  periods: Period[];
  growthExpectations: GrowthExpectation[];
  growthPaths: GrowthPath[];
  hrAssessments: HRAssessment[];
}

/** ログイン中の人 (結いナビでの役割つき) */
export interface YuiActor {
  userId: string;
  role: Role;
  /** 結いナビ上の職員 ID (従業員 ID。従業員に紐づかない社長はユーザー ID) */
  staffId: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };
