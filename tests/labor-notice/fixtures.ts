/**
 * 労働条件通知書テスト用の架空データ。実在の従業員名は使わない。
 */
import { EMPLOYMENT_PRESETS, MIN_WAGES, NOTICE_WORK_PATTERNS } from "@/lib/labor-notice/constants";
import type { NoticeInput, NoticeMasters } from "@/lib/labor-notice/types";

export function masters(overrides: Partial<NoticeMasters["company"]> = {}): NoticeMasters {
  return {
    company: {
      name: "テスト介護株式会社",
      address: "埼玉県テスト市1-1",
      representative: "代表取締役　試験 太郎",
      tel: "000-0000-0000",
      employeeCount: 45,
      hasSecondTypeCertification: false,
      fulltimeWeeklyHours: 37,
      fulltimeMonthlyDays: 21,
      variableHoursAgreementCoversNight: true,
      payCutoff: "毎月末日",
      payDay: "翌月20日",
      retirementAge: 60,
      rehireUntil: 65,
      rehireContinueAfter65: true,
      jobPostingIndefiniteTypes: [],
      ...overrides,
    },
    offices: [
      {
        id: "office-1",
        name: "テストホーム",
        address: "埼玉県テスト市2-2",
        managerName: "管理者　架空 花子",
        tel: "000-1111-2222",
        prefecture: "埼玉県",
      },
    ],
    presets: EMPLOYMENT_PRESETS,
    patterns: NOTICE_WORK_PATTERNS,
    minWages: MIN_WAGES,
  };
}

const base = {
  employeeName: "架空 一郎",
  issuedOn: "2026-10-20",
  contractStartOn: "2026-11-01",
  priorFixedTermMonths: 0,
  isPostRetirementRehire: false,
  officeId: "office-1",
  jobDescription: "介護業務（利用者の身体介護・生活援助・記録）",
  weeklyHoursText: null,
  isStudent: false,
  overrides: {},
  insuranceOverride: null,
} as const;

export function fullTimeInput(patch: Partial<NoticeInput> = {}): NoticeInput {
  return {
    ...base,
    employmentType: "FULL_TIME",
    fixedTermMonths: null,
    convertsToIndefinite: false,
    wage: {
      kind: "MONTHLY",
      baseYen: 200_000,
      qualification: "CARE_WORKER",
      singleParentChildren: 0,
      managerAllowanceYen: 0,
      counselorAllowanceYen: 0,
    },
    patternCodes: ["EARLY", "DAY", "LATE", "NIGHT"],
    daysPerWeek: 5,
    hoursPerWeek: 37,
    monthlyHours: 160,
    ...patch,
  };
}

export function partTimeInput(patch: Partial<NoticeInput> = {}): NoticeInput {
  return {
    ...base,
    employmentType: "PART_TIME",
    fixedTermMonths: 6,
    convertsToIndefinite: true,
    wage: { kind: "HOURLY", hourlyYen: 1200, qualification: "NONE", worksNight: false },
    patternCodes: ["DAY", "SHORT_DAY", "HALF_DAY"],
    daysPerWeek: 2,
    hoursPerWeek: 16,
    monthlyHours: null,
    ...patch,
  };
}

export function nightOnlyInput(patch: Partial<NoticeInput> = {}): NoticeInput {
  return {
    ...base,
    employmentType: "NIGHT_ONLY",
    fixedTermMonths: 6,
    convertsToIndefinite: false,
    wage: { kind: "NIGHT_DAILY", totalYen: 20_000, nightHours: 7 },
    patternCodes: ["NIGHT"],
    daysPerWeek: 1,
    hoursPerWeek: 14,
    monthlyHours: null,
    ...patch,
  };
}
