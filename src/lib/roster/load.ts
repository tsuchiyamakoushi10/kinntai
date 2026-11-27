/**
 * 名簿の元データを DB から取る (画面と印刷画面で共通)。
 */
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

import { filterRoster, type RosterEmployee, type RosterResult } from "./filter";
import { describeRosterQuery, type RosterQuery } from "./query";

export type RosterOffice = { id: string; code: string; name: string };

export async function loadRoster(q: RosterQuery): Promise<{
  result: RosterResult;
  offices: RosterOffice[];
  conditionText: string;
}> {
  const [employees, offices] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: { in: q.includeOnLeave ? ["ACTIVE", "ON_LEAVE"] : ["ACTIVE"] } },
      select: {
        id: true,
        employeeCode: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        birthDate: true,
        gender: true,
        officeId: true,
        jobCategory: true,
        employmentType: true,
        employmentStatus: true,
        joinedAt: true,
        office: { select: { name: true } },
      },
    }),
    prisma.office.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);

  let nightWorkerIds = new Set<string>();
  if (q.nightOnly) {
    const from = parseDateInputValue(q.nightFrom);
    const to = parseDateInputValue(q.nightTo);
    if (from && to) {
      const shifts = await prisma.shift.findMany({
        where: { workDate: { gte: from, lte: to }, shiftPattern: { shiftKind: "NIGHT_IN" } },
        select: { employeeId: true },
        distinct: ["employeeId"],
      });
      nightWorkerIds = new Set(shifts.map((s) => s.employeeId));
    }
  }

  const order = new Map(offices.map((o, i) => [o.id, i]));
  const rows: RosterEmployee[] = employees.map(({ office, ...e }) => ({
    ...e,
    officeName: office?.name ?? null,
    officeOrder: e.officeId ? (order.get(e.officeId) ?? null) : null,
  }));

  return {
    result: filterRoster(rows, q, nightWorkerIds),
    offices: offices
      .filter((o) => o.isActive)
      .map((o) => ({ id: o.id, code: o.code, name: o.name })),
    conditionText: describeRosterQuery(q, new Map(offices.map((o) => [o.id, o.name]))),
  };
}
