/**
 * 育成面談・人事考課のルール (DB に触らない純粋関数)。docs/growth-review.md
 */
import type {
  UserRole,
  EvalRank,
  GrowthDecisionStatus,
  GrowthStep,
  HrAssessmentStatus,
  InterviewRecordStatus,
} from "@prisma/client";

import { EVAL_RANKS, GROWTH_STEPS, HR_ITEMS, type HrKey } from "./constants";

export type Ranks = Record<HrKey, EvalRank | null>;

export function parseRank(v: unknown): EvalRank | null {
  return typeof v === "string" && (EVAL_RANKS as string[]).includes(v) ? (v as EvalRank) : null;
}

export function parseStep(v: unknown): GrowthStep | null {
  return typeof v === "string" && (GROWTH_STEPS as string[]).includes(v) ? (v as GrowthStep) : null;
}

/** 選択肢に含まれるものだけを、選択肢の順で返す (重複・改ざん値を落とす) */
export function pickOptions(values: unknown[], options: readonly string[]): string[] {
  const set = new Set(values.filter((v): v is string => typeof v === "string"));
  return options.filter((o) => set.has(o));
}

/** 1 つ選ぶ選択肢。空・選択肢外は null */
export function pickOption(v: unknown, options: readonly string[]): string | null {
  return typeof v === "string" && options.includes(v) ? v : null;
}

/** 金額入力 ("250,000" や全角数字も可)。空は null、読めない / マイナスは undefined */
export function parseYen(v: unknown): number | null | undefined {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，円\s]/g, "");
  if (s === "") return null;
  if (!/^\d{1,9}$/.test(s)) return undefined;
  return Number(s);
}

/** 本人が面談シートを直せるか: 担当者の面談記録が「完了」になるまで */
export function canEditSheet(recordStatus: InterviewRecordStatus | null | undefined): boolean {
  return recordStatus !== "DONE";
}

/** 部署の管理者が一次考課を直せるか: 社長が最終考課を確定するまで */
export function canEditAssessment(finalStatus: GrowthDecisionStatus | null | undefined): boolean {
  return finalStatus !== "CONFIRMED";
}

/** 一次考課から最終評価を変えた項目 (どちらかが未入力の項目は比べない) */
export function changedItems(primary: Ranks | null, final: Ranks): HrKey[] {
  if (!primary) return [];
  return HR_ITEMS.map((i) => i.key).filter(
    (k) => primary[k] !== null && final[k] !== null && primary[k] !== final[k],
  );
}

/** 一次考課を提出するときのチェック */
export function checkAssessmentSubmit(ranks: Ranks): string[] {
  const missing = HR_ITEMS.filter((i) => ranks[i.key] === null).map((i) => i.label);
  return missing.length > 0 ? [`評価が入っていない項目があります（${missing.join("、")}）`] : [];
}

/** 最終考課を確定するときのチェック */
export function checkFinalConfirm(
  primary: Ranks | null,
  final: Ranks,
  overallRank: EvalRank | null,
  changeReason: string,
): string[] {
  const errors: string[] = [];
  const missing = HR_ITEMS.filter((i) => final[i.key] === null).map((i) => i.label);
  if (missing.length > 0) errors.push(`評価が入っていない項目があります（${missing.join("、")}）`);
  if (!overallRank) errors.push("総合評価を選んでください");
  if (changedItems(primary, final).length > 0 && changeReason.trim() === "") {
    errors.push("一次考課から変えた項目があります。変えた理由を書いてください");
  }
  return errors;
}

/**
 * 処遇の「前期」の初期値。前の期間の面談確認の今期の値 → なければ従業員マスタの月給。
 * 時給の人は基本給に入れない (月給で比べる欄のため)。
 */
export function defaultPrevCompensation(
  prevReview: { currentBaseSalary: number | null; currentBonus: number | null } | null,
  employee: { baseWageType: string | null; baseWageAmount: number | null },
): { prevBaseSalary: number | null; prevBonus: number | null } {
  if (prevReview && (prevReview.currentBaseSalary !== null || prevReview.currentBonus !== null)) {
    return { prevBaseSalary: prevReview.currentBaseSalary, prevBonus: prevReview.currentBonus };
  }
  return {
    prevBaseSalary: employee.baseWageType === "MONTHLY" ? employee.baseWageAmount : null,
    prevBonus: null,
  };
}

export type PeriodInput = { name: string; startOn: string; endOn: string };

export function checkPeriod(p: PeriodInput): string[] {
  const errors: string[] = [];
  if (p.name.trim() === "") errors.push("期間の名前を入れてください（例: 2026年 上期）");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startOn) || !/^\d{4}-\d{2}-\d{2}$/.test(p.endOn)) {
    errors.push("開始日と終了日を入れてください");
  } else if (p.startOn > p.endOn) {
    errors.push("終了日は開始日より後にしてください");
  }
  return errors;
}

/** 期ごとの進み具合 (一覧の表示用) */
export type ProgressInput = {
  sheetSubmitted: boolean;
  recordStatus: InterviewRecordStatus | null;
  assessmentStatus: HrAssessmentStatus | null;
  finalStatus: GrowthDecisionStatus | null;
  reviewStatus: GrowthDecisionStatus | null;
};

export type NextStepKey = "sheet" | "record" | "assessment" | "final" | "review" | "done";

/** 次にだれが何をするか。流れ (docs §3) の順に最初の未完了を返す */
export function nextStep(p: ProgressInput): NextStepKey {
  if (!p.sheetSubmitted) return "sheet";
  if (p.recordStatus !== "DONE") return "record";
  if (p.assessmentStatus !== "SUBMITTED") return "assessment";
  if (p.finalStatus !== "CONFIRMED") return "final";
  if (p.reviewStatus !== "CONFIRMED") return "review";
  return "done";
}

export const NEXT_STEP_LABELS: Record<NextStepKey, string> = {
  sheet: "面談シート待ち",
  record: "面談記録待ち",
  assessment: "一次考課待ち",
  final: "最終考課待ち",
  review: "面談確認待ち",
  done: "完了",
};

export type GrowthActor = { userId: string; role: UserRole; employeeId: string | null };

/** 社長は全員、部署の管理者は担当の職員だけ (自分自身は除く)。docs §2 */
export function canAccessStaff(
  actor: GrowthActor,
  target: { employeeId: string; managerEmployeeId: string | null },
): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "MANAGER" || !actor.employeeId) return false;
  if (target.employeeId === actor.employeeId) return false;
  return target.managerEmployeeId === actor.employeeId;
}
