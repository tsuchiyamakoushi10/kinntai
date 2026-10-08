/**
 * DB から労働条件通知書の計算に使うマスタを読む (サーバ専用)。
 */
import type { CompanyProfile, LaborNoticeType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import { EMPLOYMENT_PRESETS, MIN_WAGES, NOTICE_WORK_PATTERNS } from "./constants";
import { mergePreset, type WorkPatternInput } from "./masters";
import type {
  MinWage,
  NoticeCompany,
  NoticeEmploymentType,
  NoticeMasters,
  NoticePreset,
} from "./types";

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
  const [profile, offices, settings] = await Promise.all([
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
    loadNoticeSettings(),
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
      presets: settings.presets,
      patterns: settings.patterns.filter((p) => p.isActive),
      minWages: settings.minWages,
    },
    noticeNumberPrefix: profile.noticeNumberPrefix,
  };
}

export const NOTICE_TYPE_TO_DB: Record<NoticeEmploymentType, LaborNoticeType> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  NIGHT_ONLY: "NIGHT_ONLY",
};

export type NoticeSettings = {
  presets: Record<NoticeEmploymentType, NoticePreset>;
  /** 並び順どおり。非表示 (isActive=false) も含む */
  patterns: WorkPatternInput[];
  minWages: MinWage[];
  /** DB に保存済みか (未保存なら既定値を表示している) */
  saved: { presets: NoticeEmploymentType[]; patterns: boolean; minWages: boolean };
};

/** 通知書の設定マスター (S-A-34)。DB に無いものは constants.ts の既定値で補う */
export async function loadNoticeSettings(): Promise<NoticeSettings> {
  const [presetRows, patternRows, wageRows] = await Promise.all([
    prisma.laborNoticePreset.findMany(),
    prisma.laborNoticeWorkPattern.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.minWage.findMany({ orderBy: [{ prefecture: "asc" }, { effectiveFrom: "desc" }] }),
  ]);

  const presets = {} as Record<NoticeEmploymentType, NoticePreset>;
  for (const type of Object.keys(EMPLOYMENT_PRESETS) as NoticeEmploymentType[]) {
    const row = presetRows.find((r) => r.noticeType === type) ?? null;
    presets[type] = mergePreset(EMPLOYMENT_PRESETS[type], row);
  }

  const patterns: WorkPatternInput[] =
    patternRows.length > 0
      ? patternRows.map((p) => ({
          code: p.code,
          label: p.label,
          start: p.startTime,
          end: p.endTime,
          endsNextDay: p.endsNextDay,
          breakMinutes: p.breakMinutes,
          isActive: p.isActive,
        }))
      : NOTICE_WORK_PATTERNS.map((p) => ({ ...p, isActive: true }));

  const minWages: MinWage[] =
    wageRows.length > 0
      ? wageRows.map((w) => ({
          prefecture: w.prefecture,
          yen: w.yen,
          effectiveFrom: toDateInputValue(w.effectiveFrom),
        }))
      : [...MIN_WAGES];

  return {
    presets,
    patterns,
    minWages,
    saved: {
      presets: presetRows.map((r) => r.noticeType as NoticeEmploymentType),
      patterns: patternRows.length > 0,
      minWages: wageRows.length > 0,
    },
  };
}
