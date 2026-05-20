/**
 * 退職金通算判定。
 *
 * docs/requirements.md §雇用契約管理 / docs/database-design.md §2.5 に基づき、
 * 正社員 (full_time) の契約が通算 3 年 (1095 日) 経過しているかを判定する。
 *
 * 判定は社労士確認・労務紛争に直結するため、必ずテスト経由で挙動を固定する。
 *
 * 仕様:
 * - `employment_type === 'full_time'` の契約だけを対象に通算日数を合計する
 * - 各契約の終了日が NULL のときは判定基準日 (デフォルト今日) までを通算する
 * - 同一日が複数契約に重なっても二重カウントしない (区間和集合を取る)
 * - 通算 1095 日以上で「対象」 (`autoEligible = true`)
 * - 各契約が持つ `retirement_allowance_eligible` のうち最新契約の値を「手動上書き」として採用
 *   (null = 自動判定にゆだねる、true/false = 手動で確定)
 */
import type { EmploymentType } from "@prisma/client";

const RETIREMENT_ALLOWANCE_THRESHOLD_DAYS = 1095; // 3 年 × 365 日

export type ContractForRetirement = {
  employmentType: EmploymentType;
  contractStartOn: Date;
  contractEndOn: Date | null;
  retirementAllowanceEligible: boolean | null;
};

export type RetirementAllowanceJudgment = {
  /** full_time 契約の通算日数 (区間和集合) */
  fullTimeTotalDays: number;
  /** 通算ルールから導かれる自動判定値 */
  autoEligible: boolean;
  /** 最新契約の手動上書き値 (null = 自動採用) */
  manualOverride: boolean | null;
  /** 最終的に対外的に使う値 (manualOverride 優先、null なら autoEligible) */
  finalEligible: boolean;
  /** あと何日で閾値到達か (既に到達済なら 0) */
  daysUntilEligible: number;
};

/**
 * 契約リストから退職金通算を計算する。
 *
 * @param contracts 任意順の契約リスト
 * @param asOf 判定基準日。デフォルトは現在時刻 (Asia/Tokyo 前提だが、ここでは Date オブジェクトの内部値で扱う)
 */
export function judgeRetirementAllowance(
  contracts: ContractForRetirement[],
  asOf: Date = new Date(),
): RetirementAllowanceJudgment {
  const fullTimeIntervals = contracts
    .filter((c) => c.employmentType === "FULL_TIME")
    .map((c) => ({
      start: startOfDay(c.contractStartOn),
      end: startOfDay(c.contractEndOn ?? asOf),
    }))
    .filter((iv) => iv.end.getTime() >= iv.start.getTime());

  const totalDays = unionDays(fullTimeIntervals);
  const autoEligible = totalDays >= RETIREMENT_ALLOWANCE_THRESHOLD_DAYS;
  const manualOverride = latestManualOverride(contracts);
  const finalEligible = manualOverride ?? autoEligible;
  const daysUntilEligible = Math.max(0, RETIREMENT_ALLOWANCE_THRESHOLD_DAYS - totalDays);

  return {
    fullTimeTotalDays: totalDays,
    autoEligible,
    manualOverride,
    finalEligible,
    daysUntilEligible,
  };
}

/**
 * 区間配列の和集合の日数を返す。end は inclusive (1日でも在籍していれば 1 日)。
 */
function unionDays(intervals: { start: Date; end: Date }[]): number {
  const [head, ...rest] = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  if (!head) return 0;

  let total = 0;
  let cursor = head.start;
  let endCursor = head.end;

  for (const iv of rest) {
    if (iv.start.getTime() <= endCursor.getTime() + ONE_DAY_MS) {
      // 連続 or 重なり: end を伸ばす
      if (iv.end.getTime() > endCursor.getTime()) {
        endCursor = iv.end;
      }
    } else {
      total += daysInclusive(cursor, endCursor);
      cursor = iv.start;
      endCursor = iv.end;
    }
  }
  total += daysInclusive(cursor, endCursor);
  return total;
}

function latestManualOverride(contracts: ContractForRetirement[]): boolean | null {
  const latest = [...contracts].sort(
    (a, b) => b.contractStartOn.getTime() - a.contractStartOn.getTime(),
  )[0];
  return latest?.retirementAllowanceEligible ?? null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function daysInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export const RETIREMENT_ALLOWANCE_THRESHOLD_DAYS_FOR_TEST = RETIREMENT_ALLOWANCE_THRESHOLD_DAYS;
