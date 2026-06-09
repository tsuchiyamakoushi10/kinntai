/**
 * 厨房自動生成の入力を DB から組み立てる (読み取り)。
 *
 * generateKitchen() は純粋関数なので、ここで DB → GenerateKitchenInput に変換する。
 * デイ/ショートと違い配置基準 (午前/午後) は使わず、需要は KITCHEN_CONFIG (固定ロスター)。
 * 記号は ShiftPattern.name (= 勤務記号マスターの基本記号) を使う。
 * prisma は引数注入 (アプリは singleton、スクリプト/テストは任意の client を渡せる)。
 */
import type { PrismaClient } from "@prisma/client";

import { dayKindFor } from "../../calendar/holidays";
import { KITCHEN_CONFIG } from "./config";
import { type GenerateKitchenInput, type KitchenDay, type KitchenEmployee } from "./generate";

/** 当月の日付一覧 (YYYY-MM-DD) を日種つきで返す。 */
export function monthDays(targetMonth: string): KitchenDay[] {
  const m = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!m) throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: KitchenDay[] = [];
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
 * 指定拠点・対象月の GenerateKitchenInput を組み立てる。
 *
 * - 厨房職員: その拠点の在籍者全員 (職種は問わない。厨房は職種別配置がない)。
 * - 入れない日: 受理済みの希望休 / 勤務不可 + 雇用期間外。
 */
export async function loadKitchenGenerateInput(
  prisma: PrismaClient,
  officeId: string,
  targetMonth: string,
): Promise<GenerateKitchenInput> {
  const days = monthDays(targetMonth);
  const monthDates = new Set(days.map((d) => d.date));
  const firstDate = days[0]!.date;
  const lastDate = days[days.length - 1]!.date;
  const rangeStart = new Date(`${firstDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${lastDate}T00:00:00.000Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const [employeesRaw, prefsRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { officeId, employmentStatus: "ACTIVE" },
      select: { id: true, employeeCode: true, joinedAt: true, retiredAt: true },
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
  ]);

  const offByEmp = new Map<string, Set<string>>();
  for (const p of prefsRaw) {
    const set = offByEmp.get(p.employeeId) ?? new Set<string>();
    set.add(ymd(p.targetDate));
    offByEmp.set(p.employeeId, set);
  }

  const employees: KitchenEmployee[] = employeesRaw.map((e) => {
    const unavailable = new Set(offByEmp.get(e.id) ?? []);
    const joined = e.joinedAt ? ymd(e.joinedAt) : null;
    const retired = e.retiredAt ? ymd(e.retiredAt) : null;
    for (const date of monthDates) {
      if ((joined && date < joined) || (retired && date > retired)) unavailable.add(date);
    }
    return { id: e.id, employeeCode: e.employeeCode, unavailableDates: unavailable };
  });

  return { days, employees, config: KITCHEN_CONFIG };
}
