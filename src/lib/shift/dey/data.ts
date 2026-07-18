/**
 * デイ自動生成の入力を DB から組み立てる (読み取り)。
 *
 * generateDey() は純粋関数なので、ここで DB → GenerateDeyInput に変換する。
 * prisma は引数注入 (アプリは singleton、スクリプト/テストは任意の client を渡せる)。
 * 記号は ShiftPattern.name (= 勤務記号マスターの基本記号) を使う。
 */
import type { DayKind, PrismaClient } from "@prisma/client";

import { isRegularEmployment } from "../../employee-labels";
import { dayKindFor } from "../../calendar/holidays";
import type { SymbolCoverage, SymbolMaster } from "../coverage";
import { mergeCrossOfficeBusyDays } from "../cross-office";
import { MANAGER_DUTY_PREFERENCE_TYPES, managerDutySymbolFor } from "../manager-duty";
import {
  DEY_DEFAULT_CONFIG,
  DEY_DEFAULT_TARGET_WORK_DAYS,
  type DeyDay,
  type DeyDemand,
  type DeyEmployee,
  type GenerateDeyInput,
} from "./generate";

/** 当月の日付一覧 (YYYY-MM-DD) を日種つきで返す。 */
export function monthDays(targetMonth: string): DeyDay[] {
  const m = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!m) throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: DeyDay[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${targetMonth}-${String(d).padStart(2, "0")}`;
    days.push({ date, dayKind: dayKindFor(date) });
  }
  return days;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 指定拠点・対象月の GenerateDeyInput を組み立てる。
 *
 * - 常勤: employment_type が FULL_TIME / PART_TIME_INSURED (社保あり)。
 * - 相談員: job_category = LIFE_COUNSELOR。
 * - 入れない日: 希望休 / 勤務不可 (却下以外) + 雇用期間外 → 公休。
 * - 有給日: 有給希望 (却下以外) → 必ず休み (有休) で出す。
 * - 目標日数: shift_constraint.target_monthly_work_days、無ければ既定 21。
 */
export async function loadDeyGenerateInput(
  prisma: PrismaClient,
  officeId: string,
  targetMonth: string,
): Promise<GenerateDeyInput> {
  const days = monthDays(targetMonth);
  const monthDates = new Set(days.map((d) => d.date));
  const firstDate = days[0]!.date;
  const lastDate = days[days.length - 1]!.date;
  const rangeStart = new Date(`${firstDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${lastDate}T00:00:00.000Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  // primary=この拠点 + support=この拠点に応援で入る職員。応援職員も配置対象に含める。
  const employeeWhere = {
    employmentStatus: "ACTIVE" as const,
    employmentType: { not: null },
    OR: [{ officeId }, { officeAssignments: { some: { officeId, role: "SUPPORT" as const } } }],
  };

  const [employeesRaw, demandsRaw, patternsRaw, prefsRaw, dutyPrefsRaw, crossShiftsRaw] =
    await Promise.all([
      prisma.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          employeeCode: true,
          employmentType: true,
          jobCategory: true,
          joinedAt: true,
          retiredAt: true,
          isManager: true,
          shiftConstraint: { select: { targetMonthlyWorkDays: true, halfDayOnly: true } },
        },
      }),
      prisma.officeCoverageDemand.findMany({
        where: { officeId },
        select: {
          dayKind: true,
          amRequired: true,
          pmRequired: true,
          counselorAmRequired: true,
          counselorPmRequired: true,
          earlyAmRequired: true,
        },
      }),
      prisma.shiftPattern.findMany({
        where: { isActive: true, OR: [{ officeId }, { officeId: null }] },
        select: { name: true, amCount: true, pmCount: true, shiftKind: true, startTime: true },
      }),
      prisma.shiftPreference.findMany({
        where: {
          status: { not: "REJECTED" },
          preferenceType: { in: ["REQUESTED_OFF", "UNAVAILABLE", "PAID_LEAVE"] },
          targetDate: { gte: rangeStart, lt: rangeEnd },
          employee: { officeId },
        },
        select: { employeeId: true, targetDate: true, preferenceType: true },
      }),
      // 管理者の事務日 / 実績周り日 (却下以外)。その日を該当勤務で固定配置する (公休を入れない)。
      prisma.shiftPreference.findMany({
        where: {
          status: { not: "REJECTED" },
          preferenceType: { in: [...MANAGER_DUTY_PREFERENCE_TYPES] },
          targetDate: { gte: rangeStart, lt: rangeEnd },
          employee: { officeId, isManager: true },
        },
        select: { employeeId: true, targetDate: true, preferenceType: true },
      }),
      // 事業所またぎ: 対象職員が別拠点で既に入っている当月シフト (勤務/公休問わず)。
      // その日は勤務不可として扱い、二重配置を防ぐ。
      prisma.shift.findMany({
        where: {
          officeId: { not: officeId },
          workDate: { gte: rangeStart, lt: rangeEnd },
          employee: employeeWhere,
        },
        select: { employeeId: true, officeId: true, workDate: true },
      }),
    ]);

  // 別拠点で塞がっている日を従業員ごとに (unavailableDates にマージする)。
  const crossBusyByEmp = mergeCrossOfficeBusyDays(
    crossShiftsRaw.map((s) => ({
      employeeId: s.employeeId,
      officeId: s.officeId,
      workDate: ymd(s.workDate),
    })),
    officeId,
  );

  // 希望休 / 勤務不可 → 公休 (不可日)、有給 → 有休 (paidLeaveDates) に振り分け。
  const offByEmp = new Map<string, Set<string>>();
  const paidByEmp = new Map<string, Set<string>>();
  for (const p of prefsRaw) {
    const target = p.preferenceType === "PAID_LEAVE" ? paidByEmp : offByEmp;
    const set = target.get(p.employeeId) ?? new Set<string>();
    set.add(ymd(p.targetDate));
    target.set(p.employeeId, set);
  }

  // 管理者の事務日 / 実績周り日を従業員ごとに (日付 → 勤務記号名)。
  const dutyByEmp = new Map<string, Map<string, string>>();
  for (const p of dutyPrefsRaw) {
    const symbol = managerDutySymbolFor(p.preferenceType);
    if (!symbol) continue;
    const map = dutyByEmp.get(p.employeeId) ?? new Map<string, string>();
    map.set(ymd(p.targetDate), symbol);
    dutyByEmp.set(p.employeeId, map);
  }

  const employees: DeyEmployee[] = employeesRaw.map((e) => {
    const unavailable = new Set(offByEmp.get(e.id) ?? []);
    const paidLeave = new Set(paidByEmp.get(e.id) ?? []);
    // 他拠点で既に入っている日を不可日に (事業所またぎの二重配置防止)。
    for (const date of crossBusyByEmp.get(e.id) ?? []) unavailable.add(date);
    // 雇用期間外 (入社前・退職後) も不可日に
    const joined = e.joinedAt ? ymd(e.joinedAt) : null;
    const retired = e.retiredAt ? ymd(e.retiredAt) : null;
    for (const date of monthDates) {
      if ((joined && date < joined) || (retired && date > retired)) unavailable.add(date);
    }
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      isFullTime: isRegularEmployment(e.employmentType),
      // 正社員 (FULL_TIME) のみ所定労働日数を厳守 (有休込みでちょうど所定日数)。
      isRegular: e.employmentType === "FULL_TIME",
      isCounselor: e.jobCategory === "LIFE_COUNSELOR",
      unavailableDates: unavailable,
      paidLeaveDates: paidLeave,
      // 管理者の事務日 / 実績周り日 (日付 → 勤務記号名)。管理者以外は空。
      managerDutyDates: dutyByEmp.get(e.id) ?? new Map<string, string>(),
      halfDayOnly: e.shiftConstraint?.halfDayOnly ?? false,
      targetWorkDays: e.shiftConstraint?.targetMonthlyWorkDays ?? DEY_DEFAULT_TARGET_WORK_DAYS,
    };
  });

  const demandByDayKind: Partial<Record<DayKind, DeyDemand>> = {};
  for (const d of demandsRaw) {
    demandByDayKind[d.dayKind] = {
      am: d.amRequired,
      pm: d.pmRequired,
      counselorAm: d.counselorAmRequired,
      counselorPm: d.counselorPmRequired,
      earlyAm: d.earlyAmRequired,
    };
  }

  const master: SymbolMaster = new Map<string, SymbolCoverage>(
    patternsRaw.map((p) => [
      p.name,
      {
        baseSymbol: p.name,
        amCount: p.amCount,
        pmCount: p.pmCount,
        isNight: p.shiftKind === "NIGHT_IN" || p.shiftKind === "NIGHT_OUT",
        // 送迎 = 8:15 までに開始 かつ 午前在席あり。Time 列は UTC の時刻として返る。
        isEarly:
          p.startTime !== null &&
          p.startTime.getUTCHours() * 60 + p.startTime.getUTCMinutes() <= 8 * 60 + 15 &&
          p.amCount > 0,
        band: "",
      },
    ]),
  );

  return { days, employees, demandByDayKind, master, config: DEY_DEFAULT_CONFIG };
}
