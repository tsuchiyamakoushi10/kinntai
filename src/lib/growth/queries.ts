/**
 * 育成面談・人事考課の読み込み。docs/growth-review.md
 */
import type { EvaluationPeriod } from "@prisma/client";

import { prisma } from "@/lib/db";

export async function listPeriods(): Promise<EvaluationPeriod[]> {
  return prisma.evaluationPeriod.findMany({
    orderBy: [{ startOn: "desc" }, { createdAt: "desc" }],
  });
}

/** ?period= の指定 → いまの期間 → いちばん新しい期間 の順で選ぶ */
export function resolvePeriod(
  periods: EvaluationPeriod[],
  requestedId: string | undefined,
): EvaluationPeriod | null {
  return (
    periods.find((p) => p.id === requestedId) ??
    periods.find((p) => p.isCurrent) ??
    periods[0] ??
    null
  );
}

export function employeeName(e: { lastName: string; firstName: string }): string {
  return `${e.lastName} ${e.firstName}`;
}

/** 1 人 × 1 期間の記録をまとめて読む */
export async function loadStaffPeriod(employeeId: string, periodId: string) {
  const key = { employeeId_periodId: { employeeId, periodId } };
  const [sheet, record, assessment, final, review, expectation] = await Promise.all([
    prisma.interviewSheet.findUnique({ where: key }),
    prisma.interviewRecord.findUnique({
      where: key,
      include: {
        interviewer: { select: { employee: { select: { lastName: true, firstName: true } } } },
      },
    }),
    prisma.hrAssessment.findUnique({
      where: key,
      include: {
        assessor: { select: { employee: { select: { lastName: true, firstName: true } } } },
      },
    }),
    prisma.hrFinalAssessment.findUnique({ where: key }),
    prisma.growthReview.findUnique({ where: key }),
    prisma.growthExpectation.findUnique({ where: key }),
  ]);
  return { sheet, record, assessment, final, review, expectation };
}

/** 期間 × 対象職員の進み具合 (一覧用) */
export async function loadProgress(periodId: string, employeeIds: string[]) {
  const where = { periodId, employeeId: { in: employeeIds } };
  const [sheets, records, assessments, finals, reviews] = await Promise.all([
    prisma.interviewSheet.findMany({ where, select: { employeeId: true, submittedAt: true } }),
    prisma.interviewRecord.findMany({ where, select: { employeeId: true, status: true } }),
    prisma.hrAssessment.findMany({ where, select: { employeeId: true, status: true } }),
    prisma.hrFinalAssessment.findMany({
      where,
      select: { employeeId: true, status: true, overallRank: true },
    }),
    prisma.growthReview.findMany({ where, select: { employeeId: true, status: true } }),
  ]);
  const by = <T extends { employeeId: string }>(rows: T[]) =>
    new Map(rows.map((r) => [r.employeeId, r]));
  return {
    sheets: by(sheets),
    records: by(records),
    assessments: by(assessments),
    finals: by(finals),
    reviews: by(reviews),
  };
}
