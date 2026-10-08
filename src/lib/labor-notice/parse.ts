/**
 * クライアントから届いた JSON を NoticeInput として検証する。
 * 型が合わない値は null を返す (エラー文言は画面側で出す)。
 */
import type {
  InsuranceSet,
  InsuranceStatus,
  NoticeEmploymentType,
  NoticeInput,
  NoticeIssueCode,
  NoticeQualification,
  NoticeWageInput,
  PresetTexts,
} from "./types";

const TYPES: ReadonlyArray<NoticeEmploymentType> = ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"];
const QUALIFICATIONS: ReadonlyArray<NoticeQualification> = [
  "NONE",
  "CARE_WORKER",
  "INITIAL_TRAINING",
  "NURSE",
  "ASSISTANT_NURSE",
];
const ISSUE_CODES: ReadonlyArray<NoticeIssueCode> = [
  "MIN_WAGE",
  "NIGHT_VARIABLE_HOURS",
  "INSURANCE_MISMATCH",
  "JOB_POSTING_TERM",
  "POST_RETIREMENT_CERTIFICATION",
];
const TEXT_KEYS: ReadonlyArray<keyof PresetTexts> = [
  "workingTimeSystem",
  "holidays",
  "trialPeriod",
  "raise",
  "bonus",
  "retirementAllowance",
  "overtime",
  "holidayWork",
  "jobScope",
  "workplaceScope",
];
const MAX_TEXT = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === "string" && v.length <= max ? v : null;
const num = (v: unknown, min = 0, max = 10_000_000): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const oneOf = <T extends string>(v: unknown, list: ReadonlyArray<T>): T | null =>
  typeof v === "string" && (list as ReadonlyArray<string>).includes(v) ? (v as T) : null;

function parseWage(v: unknown): NoticeWageInput | null {
  if (!isObj(v)) return null;
  const qualificationAllowanceYen =
    v.qualificationAllowanceYen === null || v.qualificationAllowanceYen === undefined
      ? null
      : num(v.qualificationAllowanceYen);
  if (v.kind === "MONTHLY") {
    const baseYen = num(v.baseYen);
    const qualification = oneOf(v.qualification, QUALIFICATIONS);
    const singleParentChildren = num(v.singleParentChildren, 0, 20);
    const managerAllowanceYen = num(v.managerAllowanceYen);
    const counselorAllowanceYen = num(v.counselorAllowanceYen);
    if (
      baseYen === null ||
      qualification === null ||
      singleParentChildren === null ||
      managerAllowanceYen === null ||
      counselorAllowanceYen === null
    )
      return null;
    return {
      kind: "MONTHLY",
      baseYen,
      qualification,
      qualificationAllowanceYen,
      singleParentChildren,
      managerAllowanceYen,
      counselorAllowanceYen,
    };
  }
  if (v.kind === "HOURLY") {
    const hourlyYen = num(v.hourlyYen);
    const qualification = oneOf(v.qualification, QUALIFICATIONS);
    const worksNight = bool(v.worksNight);
    if (hourlyYen === null || qualification === null || worksNight === null) return null;
    return { kind: "HOURLY", hourlyYen, qualification, qualificationAllowanceYen, worksNight };
  }
  if (v.kind === "NIGHT_DAILY") {
    const totalYen = num(v.totalYen);
    const nightHours = num(v.nightHours, 0, 24);
    if (totalYen === null || nightHours === null) return null;
    return { kind: "NIGHT_DAILY", totalYen, nightHours };
  }
  return null;
}

function parseInsurance(v: unknown): InsuranceSet | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const s: ReadonlyArray<InsuranceStatus> = ["ENROLLED", "NOT_ENROLLED"];
  const health = oneOf(v.health, s);
  const pension = oneOf(v.pension, s);
  const employment = oneOf(v.employment, s);
  if (!health || !pension || !employment) return undefined;
  return { health, pension, employment };
}

function parseOverrides(v: unknown): Partial<PresetTexts> | null {
  if (!isObj(v)) return null;
  const out: Partial<PresetTexts> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!(TEXT_KEYS as ReadonlyArray<string>).includes(k)) return null;
    const key = k as keyof PresetTexts;
    if (val === null && (key === "trialPeriod" || key === "holidayWork")) {
      out[key] = null;
      continue;
    }
    const s = str(val);
    if (s === null) return null;
    (out as Record<string, string>)[key] = s;
  }
  return out;
}

export function parseNoticeInput(v: unknown): NoticeInput | null {
  if (!isObj(v)) return null;
  const employmentType = oneOf(v.employmentType, TYPES);
  const employeeName = str(v.employeeName, 100);
  const issuedOn = str(v.issuedOn, 10);
  const contractStartOn = str(v.contractStartOn, 10);
  const fixedTermMonths = v.fixedTermMonths === null ? null : num(v.fixedTermMonths, 1, 60);
  const convertsToIndefinite = bool(v.convertsToIndefinite);
  const priorFixedTermMonths = num(v.priorFixedTermMonths, 0, 1200);
  const isPostRetirementRehire = bool(v.isPostRetirementRehire);
  const officeId = str(v.officeId, 64);
  const jobDescription = str(v.jobDescription, 200);
  const wage = parseWage(v.wage);
  const patternCodes =
    Array.isArray(v.patternCodes) &&
    v.patternCodes.every((c) => typeof c === "string" && c.length <= 32)
      ? (v.patternCodes as string[])
      : null;
  const daysPerWeek = num(v.daysPerWeek, 0, 7);
  const hoursPerWeek = num(v.hoursPerWeek, 0, 80);
  const monthlyHours = v.monthlyHours === null ? null : num(v.monthlyHours, 0, 400);
  const weeklyHoursText = v.weeklyHoursText === null ? null : str(v.weeklyHoursText, 100);
  const isStudent = bool(v.isStudent);
  const overrides = parseOverrides(v.overrides);
  const insuranceOverride = parseInsurance(v.insuranceOverride);

  if (
    employmentType === null ||
    employeeName === null ||
    issuedOn === null ||
    contractStartOn === null ||
    (v.fixedTermMonths !== null && fixedTermMonths === null) ||
    convertsToIndefinite === null ||
    priorFixedTermMonths === null ||
    isPostRetirementRehire === null ||
    officeId === null ||
    jobDescription === null ||
    wage === null ||
    patternCodes === null ||
    daysPerWeek === null ||
    hoursPerWeek === null ||
    (v.monthlyHours !== null && monthlyHours === null) ||
    (v.weeklyHoursText !== null && weeklyHoursText === null) ||
    isStudent === null ||
    overrides === null ||
    insuranceOverride === undefined
  ) {
    return null;
  }
  return {
    employmentType,
    employeeName,
    issuedOn,
    contractStartOn,
    fixedTermMonths,
    convertsToIndefinite,
    priorFixedTermMonths,
    isPostRetirementRehire,
    officeId,
    jobDescription,
    wage,
    patternCodes,
    daysPerWeek,
    hoursPerWeek,
    monthlyHours,
    weeklyHoursText,
    isStudent,
    overrides,
    insuranceOverride,
  };
}

export type Acknowledgement = { code: NoticeIssueCode; reason: string };

export function parseAcknowledgements(v: unknown): Acknowledgement[] | null {
  if (!Array.isArray(v)) return null;
  const out: Acknowledgement[] = [];
  for (const a of v) {
    if (!isObj(a)) return null;
    const code = oneOf(a.code, ISSUE_CODES);
    const reason = str(a.reason, 500);
    if (!code || reason === null) return null;
    out.push({ code, reason: reason.trim() });
  }
  return out;
}
