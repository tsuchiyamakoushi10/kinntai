/**
 * 労働条件通知書の入力 + マスタから、帳票の表示値・エラー・警告を作る純関数。
 *
 * - エラー: 法定の明示事項の漏れ。1 件でもあれば発行不可。
 * - 警告: 金額まわりなど。社長の「確認した」+ 理由で発行可。
 * docs/labor-notice.md §4 参照。
 */
import {
  formatYen,
  effectiveHourlyYen,
  initialPaidLeaveDays,
  judgeInsurance,
  minWageOn,
  splitNightWage,
  workHours,
} from "./calc";
import {
  EMPLOYMENT_PRESETS,
  EMPLOYMENT_TYPE_LABEL,
  FIXED_ALLOWANCE_ROWS,
  INDEFINITE_CONVERSION_MONTHS,
  LEGAL_DAILY_HOURS,
  PREMIUM_RATES,
  QUALIFICATION_ALLOWANCE_YEN,
  QUALIFICATION_LABEL,
  RENEWAL_CRITERIA_FIXED,
  RENEWAL_CRITERIA_TO_INDEFINITE,
  SINGLE_PARENT_ALLOWANCE_CAP_YEN,
  SINGLE_PARENT_ALLOWANCE_PER_CHILD_YEN,
} from "./constants";
import { addDays, fixedTermEndOn, isValidYmd } from "./dates";
import type {
  InsuranceSet,
  NightWageRow,
  NoticeError,
  NoticeInput,
  NoticeMasters,
  NoticePatternRow,
  NoticeResult,
  NoticeView,
  NoticeWarning,
  NoticeWorkPattern,
} from "./types";

const INSURANCE_LABEL = { ENROLLED: "加入", NOT_ENROLLED: "対象外" } as const;

function isBlank(s: string | null | undefined): boolean {
  return s === null || s === undefined || s.trim() === "";
}

export function computeNotice(input: NoticeInput, masters: NoticeMasters): NoticeResult {
  const errors: NoticeError[] = [];
  const warnings: NoticeWarning[] = [];
  const preset = EMPLOYMENT_PRESETS[input.employmentType];
  const texts = { ...preset.texts, ...input.overrides };
  const { company } = masters;

  if (!isValidYmd(input.contractStartOn)) {
    errors.push({ field: "contractStartOn", message: "契約の開始日を入力してください" });
  }
  if (!isValidYmd(input.issuedOn)) {
    errors.push({ field: "issuedOn", message: "交付日を入力してください" });
  }
  if (errors.length > 0) return { view: null, errors, warnings };

  // ---- 契約期間 ----
  const months = input.fixedTermMonths;
  const isFixed = months !== null;
  if (isFixed && (!Number.isInteger(months) || months <= 0)) {
    errors.push({ field: "fixedTermMonths", message: "契約期間（月数）を1以上で入力してください" });
  }
  const endOn = isFixed && months > 0 ? fixedTermEndOn(input.contractStartOn, months) : null;
  const convertsToIndefinite = isFixed && input.convertsToIndefinite;
  const conversionOn = convertsToIndefinite && endOn ? addDays(endOn, 1) : null;

  let indefiniteConversion: NoticeView["indefiniteConversion"] = null;
  if (conversionOn) {
    indefiniteConversion = { kind: "SWITCH", switchOn: conversionOn };
  } else if (isFixed && months > 0) {
    const cumulativeMonths = input.priorFixedTermMonths + months;
    const eligible = cumulativeMonths > INDEFINITE_CONVERSION_MONTHS;
    indefiniteConversion = { kind: "RIGHT", eligible, cumulativeMonths };
    if (eligible && input.isPostRetirementRehire && !company.hasSecondTypeCertification) {
      warnings.push({
        code: "POST_RETIREMENT_CERTIFICATION",
        message:
          "定年後の再雇用で有期契約が通算5年を超えます。第二種計画認定がないため、無期転換の申込権が発生します",
      });
    }
  }
  if (isFixed && company.jobPostingIndefiniteTypes.includes(input.employmentType)) {
    warnings.push({
      code: "JOB_POSTING_TERM",
      message:
        "有期契約ですが、求人票では「期間の定めなし」になっています。求人票の表記を確認してください",
    });
  }

  // ---- 就業場所・業務 ----
  const office = masters.offices.find((o) => o.id === input.officeId) ?? null;
  if (!office) errors.push({ field: "officeId", message: "勤務先を選んでください" });
  if (isBlank(input.jobDescription)) {
    errors.push({ field: "jobDescription", message: "業務の内容を入力してください" });
  }
  if (isBlank(texts.jobScope))
    errors.push({ field: "jobScope", message: "業務の変更の範囲を入力してください" });
  if (isBlank(texts.workplaceScope)) {
    errors.push({ field: "workplaceScope", message: "就業場所の変更の範囲を入力してください" });
  }

  // ---- 労働時間 ----
  const patterns: NoticeWorkPattern[] = [];
  for (const code of input.patternCodes) {
    const p = masters.patterns.find((x) => x.code === code);
    if (p) patterns.push(p);
  }
  if (patterns.length === 0) {
    errors.push({ field: "patternCodes", message: "勤務パターンを1つ以上選んでください" });
  }
  const patternRows: NoticePatternRow[] = patterns.map((p) => ({
    label: p.label,
    start: p.start.replace(/^0/, ""),
    end: (p.endsNextDay ? "翌" : "") + p.end.replace(/^0/, ""),
    breakMinutes: p.breakMinutes,
    workHours: workHours(p),
  }));
  if (isBlank(texts.workingTimeSystem)) {
    errors.push({ field: "workingTimeSystem", message: "労働時間の制度を入力してください" });
  }
  if (isBlank(texts.overtime))
    errors.push({ field: "overtime", message: "所定時間外労働の有無を入力してください" });
  if (!(input.daysPerWeek > 0) || !(input.hoursPerWeek > 0)) {
    errors.push({ field: "daysPerWeek", message: "週の勤務日数と時間を入力してください" });
  }
  if (
    input.employmentType === "FULL_TIME" &&
    !(input.monthlyHours !== null && input.monthlyHours > 0)
  ) {
    errors.push({ field: "monthlyHours", message: "1か月平均の勤務時間を入力してください" });
  }
  if (isBlank(texts.holidays))
    errors.push({ field: "holidays", message: "休日を入力してください" });

  // ---- 賃金 ----
  const wageRows: { label: string; body: string }[] = [];
  let summary = "";
  let nightBreakdown: NightWageRow[] | null = null;
  let nightHours: number | null = null;
  let nightTotalYen: number | null = null;
  let monthlyWageYen = 0;
  const minWage = office
    ? minWageOn(masters.minWages, office.prefecture, input.contractStartOn)
    : null;
  const minWageBreaches: string[] = [];
  const w = input.wage;

  if (w.kind === "MONTHLY" || w.kind === "HOURLY") {
    if (w.kind === "MONTHLY") {
      summary = `月給 ${formatYen(w.baseYen)}〜`;
      wageRows.push({ label: "基本給", body: `月額 ${formatYen(w.baseYen)}` });
    } else {
      summary = `時給 ${formatYen(w.hourlyYen)}`;
      wageRows.push({ label: "基本給", body: `時給 ${formatYen(w.hourlyYen)}` });
    }
    if (!((w.kind === "MONTHLY" ? w.baseYen : w.hourlyYen) > 0)) {
      errors.push({ field: "wage", message: "基本給を入力してください" });
    }

    let qualificationYen = 0;
    if (w.qualification !== "NONE") {
      const typeKey = input.employmentType === "FULL_TIME" ? "FULL_TIME" : "PART_TIME";
      const amount =
        w.qualificationAllowanceYen ?? QUALIFICATION_ALLOWANCE_YEN[typeKey][w.qualification];
      if (amount === null || amount === undefined) {
        errors.push({
          field: "qualificationAllowanceYen",
          message: `資格手当（${QUALIFICATION_LABEL[w.qualification]}）の金額を入力してください`,
        });
      } else {
        qualificationYen = amount;
        wageRows.push({
          label: `資格手当（${QUALIFICATION_LABEL[w.qualification]}）`,
          body: `月額 ${formatYen(amount)}`,
        });
      }
    }

    if (w.kind === "MONTHLY") {
      if (w.singleParentChildren > 0) {
        const yen = Math.min(
          w.singleParentChildren * SINGLE_PARENT_ALLOWANCE_PER_CHILD_YEN,
          SINGLE_PARENT_ALLOWANCE_CAP_YEN,
        );
        wageRows.push({
          label: "ひとり親手当",
          body: `月額 ${formatYen(yen)}（扶養する子1人 月${formatYen(SINGLE_PARENT_ALLOWANCE_PER_CHILD_YEN)}・上限${formatYen(SINGLE_PARENT_ALLOWANCE_CAP_YEN)}）`,
        });
      }
      if (w.managerAllowanceYen > 0) {
        wageRows.push({ label: "管理者手当", body: `月額 ${formatYen(w.managerAllowanceYen)}` });
      }
      if (w.counselorAllowanceYen > 0) {
        wageRows.push({ label: "相談員手当", body: `月額 ${formatYen(w.counselorAllowanceYen)}` });
      }
      // 最低賃金に算入する手当: 資格・管理者・相談員 (家族手当・通勤・時間外系は除外)
      const included =
        w.baseYen + qualificationYen + w.managerAllowanceYen + w.counselorAllowanceYen;
      monthlyWageYen = included;
      if (minWage && w.baseYen > 0 && input.monthlyHours && input.monthlyHours > 0) {
        const hourly = included / input.monthlyHours;
        if (hourly < minWage.yen) {
          minWageBreaches.push(`月給の時間換算 ${hourly.toFixed(1)}円`);
        }
      }
    } else {
      monthlyWageYen = (w.hourlyYen * input.hoursPerWeek * 52) / 12 + qualificationYen;
      // 未入力 (0 円) はエラー側で出すので最低賃金の警告は重ねない
      if (minWage && w.hourlyYen > 0 && w.hourlyYen < minWage.yen) {
        minWageBreaches.push(`時給 ${formatYen(w.hourlyYen)}`);
      }
    }

    for (const row of FIXED_ALLOWANCE_ROWS[input.employmentType]) {
      if (row.onlyIfWorksNight && !(w.kind === "HOURLY" && w.worksNight)) continue;
      wageRows.push({ label: row.label, body: row.body });
    }
  } else {
    summary = `1回 ${formatYen(w.totalYen)}`;
    nightHours = w.nightHours;
    nightTotalYen = w.totalYen;
    if (!(w.totalYen > 0))
      errors.push({ field: "wage", message: "1回あたりの金額を入力してください" });
    if (!(w.nightHours >= 0))
      errors.push({ field: "nightHours", message: "深夜時間数を入力してください" });
    monthlyWageYen = (w.totalYen * input.daysPerWeek * 52) / 12;
    const variable = company.variableHoursAgreementCoversNight;
    nightBreakdown = patternRows.map((p) => {
      const split = splitNightWage(w.totalYen, p.workHours, w.nightHours);
      if (minWage && w.totalYen > 0) {
        const overtimeHours = variable ? 0 : Math.max(0, p.workHours - LEGAL_DAILY_HOURS);
        const hourly = effectiveHourlyYen({
          totalYen: w.totalYen,
          workHours: p.workHours,
          nightHours: w.nightHours,
          overtimeHours,
        });
        if (hourly < minWage.yen)
          minWageBreaches.push(`${p.label}の時間換算 ${hourly.toFixed(1)}円`);
      }
      return { label: p.label, workHours: p.workHours, ...split };
    });
    wageRows.push({
      label: "日給（1回あたり）",
      body: `${formatYen(w.totalYen)}（勤務パターンにかかわらず同額）`,
    });
    for (const row of FIXED_ALLOWANCE_ROWS.NIGHT_ONLY)
      wageRows.push({ label: row.label, body: row.body });
    if (!variable) {
      warnings.push({
        code: "NIGHT_VARIABLE_HOURS",
        message:
          "夜勤専従の変形労働時間制が未設定です（会社設定で労使協定の対象になっていません）。8時間を超える分が時間外になります",
      });
    }
  }
  if (minWage && minWageBreaches.length > 0) {
    warnings.push({
      code: "MIN_WAGE",
      message: `最低賃金${formatYen(minWage.yen)}（${minWage.prefecture}）を下回ります：${minWageBreaches.join("、")}`,
    });
  }
  if (isBlank(company.payCutoff) || isBlank(company.payDay)) {
    errors.push({ field: "payCutoff", message: "会社設定の賃金の締切日・支払日が未設定です" });
  }
  if (!(company.retirementAge > 0)) {
    errors.push({ field: "retirementAge", message: "会社設定の定年が未設定です" });
  }

  // ---- 社会保険等 ----
  const judged = judgeInsurance({
    onDate: input.contractStartOn,
    isFullTime: input.employmentType === "FULL_TIME",
    hoursPerWeek: input.hoursPerWeek,
    daysPerWeek: input.daysPerWeek,
    monthlyWageYen,
    isStudent: input.isStudent,
    expectedOver31Days: endOn === null || daysBetween(input.contractStartOn, endOn) + 1 >= 31,
    fulltimeWeeklyHours: company.fulltimeWeeklyHours,
    fulltimeMonthlyDays: company.fulltimeMonthlyDays,
    employeeCount: company.employeeCount,
  });
  const insurance: InsuranceSet = input.insuranceOverride ?? judged;
  if (input.insuranceOverride && !sameInsurance(input.insuranceOverride, judged)) {
    warnings.push({
      code: "INSURANCE_MISMATCH",
      message: `社会保険等の自動判定（健保 ${INSURANCE_LABEL[judged.health]}・厚年 ${INSURANCE_LABEL[judged.pension]}・雇保 ${INSURANCE_LABEL[judged.employment]}）と入力が違います`,
    });
  }

  const weeklyHoursText =
    input.weeklyHoursText && !isBlank(input.weeklyHoursText)
      ? input.weeklyHoursText
      : `約${input.hoursPerWeek}時間（週${input.daysPerWeek}日程度）`;

  const view: NoticeView = {
    employmentType: input.employmentType,
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[input.employmentType],
    employeeName: input.employeeName,
    issuedOn: input.issuedOn,
    company: {
      name: company.name,
      address: company.address,
      representative: company.representative,
      tel: company.tel,
    },
    office: office
      ? {
          name: office.name,
          address: office.address,
          managerName: office.managerName,
          tel: office.tel,
        }
      : { name: "", address: "", managerName: "", tel: "" },
    contract: {
      startOn: input.contractStartOn,
      endOn,
      months: isFixed ? months : null,
      convertsToIndefinite,
      conversionOn,
      renewalCriteria: !isFixed
        ? []
        : convertsToIndefinite
          ? RENEWAL_CRITERIA_TO_INDEFINITE
          : RENEWAL_CRITERIA_FIXED,
      trialPeriod: texts.trialPeriod,
    },
    indefiniteConversion,
    jobDescription: input.jobDescription,
    jobScope: texts.jobScope,
    workplaceScope: texts.workplaceScope,
    patterns: patternRows,
    workingTimeSystem: texts.workingTimeSystem,
    monthlyHours: input.employmentType === "FULL_TIME" ? input.monthlyHours : null,
    weeklyHoursText,
    overtime: texts.overtime,
    holidayWork: texts.holidayWork,
    holidays: texts.holidays,
    paidLeaveDays: initialPaidLeaveDays(input.daysPerWeek, input.hoursPerWeek),
    daysPerWeek: input.daysPerWeek,
    wage: { summary, rows: wageRows, nightTotalYen, nightBreakdown, nightHours },
    premiumRates: PREMIUM_RATES,
    payCutoff: company.payCutoff,
    payDay: company.payDay,
    raise: texts.raise,
    bonus: texts.bonus,
    retirementAllowance: texts.retirementAllowance,
    retirement: {
      age: company.retirementAge,
      rehireUntil: company.rehireUntil,
      continueAfter65: company.rehireContinueAfter65,
    },
    insurance: { ...insurance, workersComp: "ENROLLED" },
    legalBasis:
      input.employmentType === "FULL_TIME"
        ? "労働基準法第15条"
        : "労働基準法第15条およびパートタイム・有期雇用労働法第6条",
  };

  return { view, errors, warnings };
}

function sameInsurance(a: InsuranceSet, b: InsuranceSet): boolean {
  return a.health === b.health && a.pension === b.pension && a.employment === b.employment;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
