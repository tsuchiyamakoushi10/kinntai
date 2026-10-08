/**
 * DB から労働条件通知書の計算に使うマスタを読む (サーバ専用)。
 */
import type { CompanyProfile, LaborNoticeType } from "@prisma/client";

import { prisma } from "@/lib/db";

import { MIN_WAGES, NOTICE_WORK_PATTERNS } from "./constants";
import type { NoticeCompany, NoticeEmploymentType, NoticeMasters } from "./types";

export function toNoticeCompany(p: CompanyProfile): NoticeCompany {
  return {
    name: p.legalName,
    address: p.address,
    representative: `${p.representativeTitle}　${p.representativeName}`,
    tel: p.phone,
    employeeCount: p.employeeCount,
    hasSecondTypeCertification: p.hasSecondTypeCertification,
    fulltimeWeeklyHours: Number(p.fulltimeWeeklyHours),
    fulltimeMonthlyDays: Number(p.fulltimeMonthlyDays),
    variableHoursAgreementCoversNight: p.variableHoursAgreementCoversNight,
    payCutoff: p.wageCutoffDay,
    payDay: p.wagePaymentDay,
    retirementAge: p.retirementAge,
    rehireUntil: p.continuedEmploymentAge,
    rehireContinueAfter65: p.rehireContinueAfter65,
    jobPostingIndefiniteTypes: p.jobPostingIndefiniteTypes as NoticeEmploymentType[],
  };
}

/** 会社情報が未登録なら null (通知書を作れない) */
export async function loadNoticeMasters(): Promise<{
  masters: NoticeMasters;
  noticeNumberPrefix: string;
} | null> {
  const [profile, offices] = await Promise.all([
    prisma.companyProfile.findFirst(),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        managerName: true,
        phone: true,
        prefecture: true,
      },
    }),
  ]);
  if (!profile) return null;
  return {
    masters: {
      company: toNoticeCompany(profile),
      offices: offices.map((o) => ({
        id: o.id,
        name: o.name,
        address: o.address ?? "",
        managerName: o.managerName ?? "",
        tel: o.phone ?? profile.phone,
        prefecture: o.prefecture,
      })),
      patterns: NOTICE_WORK_PATTERNS,
      minWages: MIN_WAGES,
    },
    noticeNumberPrefix: profile.noticeNumberPrefix,
  };
}

export const NOTICE_TYPE_TO_DB: Record<NoticeEmploymentType, LaborNoticeType> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  NIGHT_ONLY: "NIGHT_ONLY",
};
