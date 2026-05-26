/**
 * S-A-26 自動作成画面のデータ収集。
 *
 * 拠点 × 対象月の入力データを Prisma から取り出し、
 * `src/lib/shift/auto-generator` の GenerateInput に変換する。
 *
 * Server Components / Server Actions の両方から使えるよう純粋関数として定義。
 */
import { holidaysInMonth } from "@/lib/calendar/holidays";
import { prisma } from "@/lib/db";
import { patternWorkMinutes, type ShiftPatternInput } from "@/lib/shift/income-projection";
import type {
  EmployeeForGen,
  ExistingShift,
  GenerateInput,
  PatternForGen,
  PreferenceForGen,
  PrevMonthNightIn,
  QuotaForGen,
} from "@/lib/shift/auto-generator";

import { monthRange } from "@/lib/attendance/business-date";

function timeToHhmm(d: Date | null): string | null {
  if (!d) return null;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** 拠点 × 対象月の GenerateInput を組み立てる。 */
export async function loadGenerateInput(
  officeId: string,
  targetMonth: string,
  seed: number,
  algorithmVersion: string,
): Promise<GenerateInput> {
  const range = monthRange(targetMonth);
  const prevRange = monthRange(range.prevYm);

  const [
    employeesRaw,
    patternsRaw,
    quotasRaw,
    constraintsRaw,
    preferencesRaw,
    existingShiftsRaw,
    prevNightInRaw,
    contracts,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: {
        officeId,
        employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] },
        OR: [{ retiredAt: null }, { retiredAt: { gte: range.start } }],
        joinedAt: { lt: range.end },
      },
      select: {
        id: true,
        employeeCode: true,
        employmentType: true,
        employmentStatus: true,
        joinedAt: true,
        retiredAt: true,
        weeklyWorkDays: true,
        baseWageType: true,
        baseWageAmount: true,
      },
    }),
    prisma.shiftPattern.findMany({
      where: {
        isActive: true,
        OR: [{ officeId }, { officeId: null }],
      },
      select: {
        id: true,
        code: true,
        name: true,
        shiftKind: true,
        officeId: true,
        sortOrder: true,
        startTime: true,
        endTime: true,
        crossesMidnight: true,
        breakMinutes: true,
      },
    }),
    prisma.officeShiftQuota.findMany({
      where: { officeId },
      select: { shiftPatternId: true, dayKind: true, requiredCount: true },
    }),
    prisma.shiftConstraint.findMany({
      where: {
        employee: {
          officeId,
          employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] },
        },
      },
      select: {
        employeeId: true,
        maxMonthlyWorkMinutes: true,
        maxNightShiftsPerMonth: true,
        allowNightShiftOverride: true,
        targetMonthlyWorkDays: true,
        annualIncomeCapYen: true,
        unavailableDaysOfWeek: true,
      },
    }),
    prisma.shiftPreference.findMany({
      where: {
        status: "ACCEPTED",
        targetDate: { gte: range.start, lt: range.end },
        employee: { officeId },
      },
      select: { employeeId: true, targetDate: true, preferenceType: true },
    }),
    prisma.shift.findMany({
      where: { officeId, workDate: { gte: range.start, lt: range.end } },
      select: {
        employeeId: true,
        workDate: true,
        shiftPatternId: true,
        generationRunId: true,
        updatedBy: true,
      },
    }),
    prisma.shift.findMany({
      where: {
        officeId,
        workDate: { gte: prevRange.start, lt: range.start },
        shiftPattern: { shiftKind: "NIGHT_IN" },
      },
      orderBy: { workDate: "desc" },
      select: { employeeId: true, workDate: true },
    }),
    // 時給契約のみ年収アラート対象。最新契約の wage_amount を採用。
    prisma.employmentContract.findMany({
      where: {
        employee: { officeId },
        contractStartOn: { lte: range.end },
        OR: [{ contractEndOn: null }, { contractEndOn: { gte: range.start } }],
        wageType: "HOURLY",
      },
      orderBy: { contractStartOn: "desc" },
      select: { employeeId: true, wageAmount: true },
    }),
  ]);

  // 当月の自動配置由来 run を引いて、保護対象 / 上書き対象を分離する
  const existingRun = await prisma.shiftGenerationRun.findUnique({
    where: { officeId_targetMonth: { officeId, targetMonth: range.start } },
    select: { id: true, generatedById: true },
  });

  // 既存 shifts のうち「自動配置直後 = 上書き可」のものは existingShifts に含めない
  // (= 再実行で消える)。手動分 (generation_run_id IS NULL) と
  //   人手編集分 (generation_run_id 持ち + updatedBy != generatedBy) は保護。
  const existingShifts: ExistingShift[] = [];
  for (const s of existingShiftsRaw) {
    const isAutoUntouched =
      existingRun !== null &&
      s.generationRunId !== null &&
      s.generationRunId === existingRun.id &&
      s.updatedBy === existingRun.generatedById;
    if (isAutoUntouched) continue;
    existingShifts.push({
      employeeId: s.employeeId,
      workDate: ymd(s.workDate),
      shiftPatternId: s.shiftPatternId,
    });
  }

  const constraintByEmp = new Map(constraintsRaw.map((c) => [c.employeeId, c] as const));
  const hourlyByEmp = new Map<string, number>();
  for (const c of contracts) {
    if (!hourlyByEmp.has(c.employeeId) && c.wageAmount !== null) {
      hourlyByEmp.set(c.employeeId, c.wageAmount);
    }
  }

  // CSV 取り込みで必須項目が空欄の従業員は自動生成の入力にできないので除外する。
  // (employmentType / joinedAt / weeklyWorkDays が無いと公休生成や 130 万判定が成立しない)
  const employees: EmployeeForGen[] = employeesRaw
    .filter((e) => e.employmentType !== null && e.joinedAt !== null && e.weeklyWorkDays !== null)
    .map((e) => {
      const c = constraintByEmp.get(e.id) ?? null;
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        employmentType: e.employmentType!,
        joinedOn: ymd(e.joinedAt!),
        isOnLeave: e.employmentStatus === "ON_LEAVE",
        weeklyWorkDays: Number(e.weeklyWorkDays),
        hourlyWageYen: hourlyByEmp.get(e.id) ?? null,
        retiredOn: e.retiredAt ? ymd(e.retiredAt) : null,
        constraint: c
          ? {
              maxMonthlyWorkMinutes: c.maxMonthlyWorkMinutes,
              maxNightShiftsPerMonth: c.maxNightShiftsPerMonth,
              allowNightShiftOverride: c.allowNightShiftOverride,
              targetMonthlyWorkDays: c.targetMonthlyWorkDays,
              annualIncomeCapYen: c.annualIncomeCapYen,
              unavailableDaysOfWeek: c.unavailableDaysOfWeek,
            }
          : null,
      };
    });

  const shiftPatterns: PatternForGen[] = patternsRaw.map((p) => {
    const pi: ShiftPatternInput = {
      startTime: timeToHhmm(p.startTime),
      endTime: timeToHhmm(p.endTime),
      crossesMidnight: p.crossesMidnight,
      breakMinutes: p.breakMinutes,
    };
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      shiftKind: p.shiftKind,
      officeId: p.officeId,
      sortOrder: p.sortOrder,
      workMinutes: patternWorkMinutes(pi),
      crossesMidnight: p.crossesMidnight,
    };
  });

  const quotas: QuotaForGen[] = quotasRaw.map((q) => ({
    shiftPatternId: q.shiftPatternId,
    dayKind: q.dayKind,
    requiredCount: q.requiredCount,
  }));

  const preferences: PreferenceForGen[] = preferencesRaw.map((p) => ({
    employeeId: p.employeeId,
    targetDate: ymd(p.targetDate),
    preferenceType: p.preferenceType as "REQUESTED_OFF" | "PREFERRED_NIGHT" | "UNAVAILABLE",
  }));

  // 前月最終日の NIGHT_IN だけ拾う (それより前の NIGHT_IN は既に NIGHT_OUT が出ているはず)
  const prevLastDay = ymd(new Date(range.start.getTime() - 86400000));
  const prevMonthNightIn: PrevMonthNightIn[] = prevNightInRaw
    .filter((s) => ymd(s.workDate) === prevLastDay)
    .map((s) => ({ employeeId: s.employeeId, workDate: ymd(s.workDate) }));

  return {
    officeId,
    targetMonth,
    seed,
    algorithmVersion,
    employees,
    shiftPatterns,
    quotas,
    preferences,
    existingShifts,
    prevMonthNightIn,
    holidays: holidaysInMonth(targetMonth),
  };
}

function ymd(d: Date): string {
  // UTC 0:00 として保存される @db.Date は、ローカル TZ に関わらず YYYY-MM-DD で取れる
  return d.toISOString().slice(0, 10);
}
