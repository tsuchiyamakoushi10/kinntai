/**
 * ショート自動生成の入力を DB から組み立てる (読み取り)。
 *
 * generateShort() は純粋関数なので、ここで DB → GenerateShortInput に変換する。
 * dey/data.ts と同型 + 夜勤の要素 (配置基準の nightInRequired、従業員の夜勤上限)。
 * prisma は引数注入 (アプリは singleton、スクリプト/テストは任意の client を渡せる)。
 * 記号は ShiftPattern.name (= 勤務記号マスターの基本記号) を使う。
 */
import type { DayKind, PrismaClient } from "@prisma/client";

import { isRegularEmployment } from "../../employee-labels";
import { dayKindFor } from "../../calendar/holidays";
import type { SymbolCoverage, SymbolMaster } from "../coverage";
import {
  SHORT_DEFAULT_CONFIG,
  SHORT_DEFAULT_TARGET_WORK_DAYS,
  type GenerateShortInput,
  type ShortConfig,
  type ShortDay,
  type ShortDemand,
  type ShortEmployee,
} from "./generate";

/**
 * 夜勤上限の既定値 (回/月)。設計書 §4.1 既定 5。
 * shift_constraints.max_night_shifts_per_month が無い従業員はこれを使う。
 *
 * TODO(データ): ショートの夜勤可否は本来「この職員は夜勤に入れるか」をデータで持つべき。
 * 現状は全員に既定 5 を当てるため、本来夜勤に入らない職種 (看護/相談員等) も候補に入りうる。
 * 従業員マスターに夜勤上限/夜勤可否を入力したら、ここの既定依存は解消する
 * (docs/auto-shift-design-v2.md §4.2 / memory: project_coverage_model_dey_short_2026_06_08)。
 */
export const SHORT_DEFAULT_NIGHT_CAP = 5;

/** 当月の日付一覧 (YYYY-MM-DD) を日種つきで返す。 */
export function monthDays(targetMonth: string): ShortDay[] {
  const m = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!m) throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: ShortDay[] = [];
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
 * 指定拠点・対象月の GenerateShortInput を組み立てる。
 *
 * - 常勤: employment_type が FULL_TIME / CONTRACT。
 * - 相談員: job_category = LIFE_COUNSELOR。
 * - 入れない日: 受理済みの希望休 / 勤務不可 + 雇用期間外。
 * - 目標日数: shift_constraint.target_monthly_work_days、無ければ既定 21。
 * - 夜勤上限: shift_constraint.max_night_shifts_per_month、無ければ既定 5 (上記 TODO)。
 *
 * config は使う記号セット (拠点ごと)。ショートステイは既定、ナーシングホーム等は終日記号が
 * 「日勤」になるなど拠点で異なるため、呼び出し側 (office-generator.ts) から渡す。
 */
export async function loadShortGenerateInput(
  prisma: PrismaClient,
  officeId: string,
  targetMonth: string,
  config: ShortConfig = SHORT_DEFAULT_CONFIG,
): Promise<GenerateShortInput> {
  const days = monthDays(targetMonth);
  const monthDates = new Set(days.map((d) => d.date));
  const firstDate = days[0]!.date;
  const lastDate = days[days.length - 1]!.date;
  const rangeStart = new Date(`${firstDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${lastDate}T00:00:00.000Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const [employeesRaw, demandsRaw, patternsRaw, prefsRaw, nightPrefsRaw, paidPrefsRaw] =
    await Promise.all([
      prisma.employee.findMany({
        where: { officeId, employmentStatus: "ACTIVE", employmentType: { not: null } },
        select: {
          id: true,
          employeeCode: true,
          lastName: true,
          employmentType: true,
          jobCategory: true,
          joinedAt: true,
          retiredAt: true,
          shiftConstraint: {
            select: { targetMonthlyWorkDays: true, maxNightShiftsPerMonth: true },
          },
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
          nurseAmRequired: true,
          nursePmRequired: true,
          nightInRequired: true,
        },
      }),
      prisma.shiftPattern.findMany({
        where: { isActive: true, OR: [{ officeId }, { officeId: null }] },
        select: { name: true, amCount: true, pmCount: true, shiftKind: true },
      }),
      prisma.shiftPreference.findMany({
        where: {
          status: "ACCEPTED",
          preferenceType: { in: ["REQUESTED_OFF", "UNAVAILABLE"] },
          targetDate: { gte: rangeStart, lt: rangeEnd },
          employee: { officeId },
        },
        select: { employeeId: true, targetDate: true },
      }),
      // 夜勤希望 (却下以外)。夜勤割当でその日を優先する。
      prisma.shiftPreference.findMany({
        where: {
          status: { not: "REJECTED" },
          preferenceType: "PREFERRED_NIGHT",
          targetDate: { gte: rangeStart, lt: rangeEnd },
          employee: { officeId },
        },
        select: { employeeId: true, targetDate: true },
      }),
      // 有給 (却下以外)。必ず休みにし有休で出す。
      prisma.shiftPreference.findMany({
        where: {
          status: { not: "REJECTED" },
          preferenceType: "PAID_LEAVE",
          targetDate: { gte: rangeStart, lt: rangeEnd },
          employee: { officeId },
        },
        select: { employeeId: true, targetDate: true },
      }),
    ]);

  // 希望休 / 勤務不可 を従業員ごとの不可日に
  const offByEmp = new Map<string, Set<string>>();
  for (const p of prefsRaw) {
    const set = offByEmp.get(p.employeeId) ?? new Set<string>();
    set.add(ymd(p.targetDate));
    offByEmp.set(p.employeeId, set);
  }

  // 夜勤希望日を従業員ごとに。
  const nightByEmp = new Map<string, Set<string>>();
  for (const p of nightPrefsRaw) {
    const set = nightByEmp.get(p.employeeId) ?? new Set<string>();
    set.add(ymd(p.targetDate));
    nightByEmp.set(p.employeeId, set);
  }

  // 有給日を従業員ごとに。
  const paidByEmp = new Map<string, Set<string>>();
  for (const p of paidPrefsRaw) {
    const set = paidByEmp.get(p.employeeId) ?? new Set<string>();
    set.add(ymd(p.targetDate));
    paidByEmp.set(p.employeeId, set);
  }

  // 拠点固有の職員別上書き (氏名キー)。NH の固定配置・夜勤上限・相談員指定など。
  const roster = config.roster ?? {};
  const employees: ShortEmployee[] = employeesRaw
    .filter((e) => {
      // 清掃/事務・その他職種は配置人数に数えない (生成対象から外す)。
      // ただし固定配置を持つ人 (NH の柔整師=木下など) は配置に必要なので残す。
      const ov = roster[e.lastName];
      if ((e.jobCategory === "OFFICE_STAFF" || e.jobCategory === "OTHER") && !ov?.fixedSymbol) {
        return false;
      }
      return true;
    })
    .map((e) => {
      const ov = roster[e.lastName];
      const unavailable = new Set(offByEmp.get(e.id) ?? []);
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
        // 相談員: roster 指定を優先 (DB の職種が未整備でも相談員として扱える)。
        isCounselor: ov?.isCounselor ?? e.jobCategory === "LIFE_COUNSELOR",
        isNurse: e.jobCategory === "NURSE",
        unavailableDates: unavailable,
        targetWorkDays: e.shiftConstraint?.targetMonthlyWorkDays ?? SHORT_DEFAULT_TARGET_WORK_DAYS,
        // 夜勤上限: roster 指定 > DB 設定 > 既定5。NH は夜勤可者だけ正の値、他は 0。
        nightCap:
          ov?.nightCap ?? e.shiftConstraint?.maxNightShiftsPerMonth ?? SHORT_DEFAULT_NIGHT_CAP,
        preferredNightDates: new Set(nightByEmp.get(e.id) ?? []),
        paidLeaveDates: new Set(paidByEmp.get(e.id) ?? []),
        // 固定配置 (NH の固定番)。指定が無ければ null。
        fixedSymbol: ov?.fixedSymbol ?? null,
      };
    });

  const demandByDayKind: Partial<Record<DayKind, ShortDemand>> = {};
  for (const d of demandsRaw) {
    demandByDayKind[d.dayKind] = {
      am: d.amRequired,
      pm: d.pmRequired,
      counselorAm: d.counselorAmRequired,
      counselorPm: d.counselorPmRequired,
      nurseAm: d.nurseAmRequired,
      nursePm: d.nursePmRequired,
      nightIn: d.nightInRequired,
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
        band: "",
      },
    ]),
  );

  return { days, employees, demandByDayKind, master, config };
}
