/**
 * 研修アンケート画面で使うデータ読み込み (サーバ専用)。
 */
import { prisma } from "@/lib/db";

import type { EditorOffice } from "./survey-editor";

/** 配る相手の選択肢 (退職者を除く在籍者を拠点ごとに) */
export async function loadTargetOffices(): Promise<EditorOffice[]> {
  const [offices, employees] = await Promise.all([
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { employmentStatus: { not: "RETIRED" } },
      orderBy: { employeeCode: "asc" },
      select: { id: true, lastName: true, firstName: true, officeId: true },
    }),
  ]);
  const groups: EditorOffice[] = offices.map((o) => ({
    id: o.id,
    name: o.name,
    employees: employees
      .filter((e) => e.officeId === o.id)
      .map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` })),
  }));
  const noOffice = employees.filter((e) => !offices.some((o) => o.id === e.officeId));
  if (noOffice.length > 0) {
    groups.push({
      id: "",
      name: "拠点なし",
      employees: noOffice.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` })),
    });
  }
  return groups.filter((g) => g.employees.length > 0);
}

export { toSurveyQuestion } from "@/lib/training-survey/from-db";
