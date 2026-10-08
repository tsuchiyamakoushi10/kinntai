/**
 * 作成画面 (S-A-31) に渡すデータの組み立て (サーバ専用)。
 */
import type { JobCategory } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { NoticeEmploymentType, NoticeInput } from "@/lib/labor-notice/types";

import type { EditorEmployee } from "./notice-editor";

const JOB_DESCRIPTION: Record<JobCategory, string> = {
  CARE_WORKER: "介護業務（利用者の身体介護・生活援助・記録）",
  NURSE: "看護業務（利用者の健康管理・服薬管理・記録）",
  LIFE_COUNSELOR: "生活相談員業務（利用者・家族の相談対応、関係機関との連絡調整）",
  CARE_MANAGER: "介護支援専門員業務（ケアプランの作成・管理）",
  OFFICE_STAFF: "事務業務",
  OTHER: "",
};
const NIGHT_JOB_DESCRIPTION = "夜間の介護業務（巡回・排泄介助・記録等）";

export async function loadEditorEmployees(): Promise<EditorEmployee[]> {
  const [employees, issued] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: { not: "RETIRED" } },
      orderBy: { employeeCode: "asc" },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        officeId: true,
        jobCategory: true,
        employmentType: true,
        nightShiftOnly: true,
      },
    }),
    prisma.laborNotice.findMany({
      where: { status: { in: ["ISSUED", "SIGNED"] } },
      select: { employeeId: true, input: true },
    }),
  ]);

  // 発行済みの有期月数を従業員ごとに合計 (無期転換の通算の初期値)
  const priorMonths = new Map<string, number>();
  for (const n of issued) {
    const months = (n.input as Partial<NoticeInput> | null)?.fixedTermMonths;
    if (typeof months === "number") {
      priorMonths.set(n.employeeId, (priorMonths.get(n.employeeId) ?? 0) + months);
    }
  }

  return employees.map((e) => {
    const defaultType: NoticeEmploymentType = e.nightShiftOnly
      ? "NIGHT_ONLY"
      : e.employmentType === "FULL_TIME"
        ? "FULL_TIME"
        : "PART_TIME";
    return {
      id: e.id,
      name: `${e.lastName} ${e.firstName}`,
      officeId: e.officeId,
      jobDescription: e.nightShiftOnly
        ? NIGHT_JOB_DESCRIPTION
        : e.jobCategory
          ? JOB_DESCRIPTION[e.jobCategory]
          : "",
      defaultType,
      priorFixedTermMonths: priorMonths.get(e.id) ?? 0,
    };
  });
}
