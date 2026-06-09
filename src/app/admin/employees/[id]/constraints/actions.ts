"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export type ShiftConstraintFormValues = {
  /** UI は時間で扱う。空 = 制約なし。 */
  maxMonthlyWorkHours: string;
  maxDailyWorkHours: string;
  maxNightShiftsPerMonth: string;
  /** 月の夜勤希望回数 (Employee 列)。上限とは別軸。空 = 希望なし。 */
  desiredNightShiftsPerMonth: string;
  allowNightShiftOverride: string;
  targetMonthlyWorkDays: string;
  annualIncomeCapYen: string;
  /** 半日勤務のみ ("on" / "")。デイ自動生成で終日を割り当てない。 */
  halfDayOnly: string;
  /** "0,1,..,6" の CSV (日=0 .. 土=6)。空文字は「制限なし」。 */
  unavailableDaysOfWeek: string;
  notes: string;
};

export type ShiftConstraintFormState = {
  error?: string;
  message?: string;
  values?: ShiftConstraintFormValues;
};

// shift_constraints に保存する値。
type Parsed = {
  maxMonthlyWorkMinutes: number | null;
  maxDailyWorkMinutes: number | null;
  maxNightShiftsPerMonth: number | null;
  allowNightShiftOverride: boolean;
  targetMonthlyWorkDays: number | null;
  annualIncomeCapYen: number | null;
  halfDayOnly: boolean;
  unavailableDaysOfWeek: number[];
  notes: string;
};

function readForm(formData: FormData): ShiftConstraintFormValues {
  const days = formData.getAll("unavailableDaysOfWeek").map((v) => String(v));
  return {
    maxMonthlyWorkHours: String(formData.get("maxMonthlyWorkHours") ?? "").trim(),
    maxDailyWorkHours: String(formData.get("maxDailyWorkHours") ?? "").trim(),
    maxNightShiftsPerMonth: String(formData.get("maxNightShiftsPerMonth") ?? "").trim(),
    desiredNightShiftsPerMonth: String(formData.get("desiredNightShiftsPerMonth") ?? "").trim(),
    allowNightShiftOverride: formData.get("allowNightShiftOverride") ? "on" : "",
    targetMonthlyWorkDays: String(formData.get("targetMonthlyWorkDays") ?? "").trim(),
    annualIncomeCapYen: String(formData.get("annualIncomeCapYen") ?? "").trim(),
    halfDayOnly: formData.get("halfDayOnly") ? "on" : "",
    unavailableDaysOfWeek: days.join(","),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

function parseHoursToMinutes(
  s: string,
  label: string,
  maxHours: number,
): { ok: true; minutes: number | null } | { ok: false; error: string } {
  if (s === "") return { ok: true, minutes: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > maxHours) {
    return { ok: false, error: `${label}は 0〜${maxHours} 時間の範囲で入力してください。` };
  }
  // 0.5 時間刻みを許容して分に変換。途中の小数は四捨五入で丸める。
  return { ok: true, minutes: Math.round(n * 60) };
}

function parseInteger(
  s: string,
  label: string,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (s === "") return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label}は ${min}〜${max} の整数で入力してください。` };
  }
  return { ok: true, value: n };
}

function parseAndValidate(
  values: ShiftConstraintFormValues,
):
  | { ok: true; data: Parsed; desiredNightShiftsPerMonth: number | null }
  | { ok: false; error: string } {
  const monthly = parseHoursToMinutes(values.maxMonthlyWorkHours, "月間勤務時間上限", 400);
  if (!monthly.ok) return monthly;
  const daily = parseHoursToMinutes(values.maxDailyWorkHours, "1 日勤務時間上限", 24);
  if (!daily.ok) return daily;
  const nightMax = parseInteger(values.maxNightShiftsPerMonth, "月間夜勤上限", 0, 31);
  if (!nightMax.ok) return nightMax;
  const nightDesired = parseInteger(values.desiredNightShiftsPerMonth, "月の夜勤希望回数", 0, 31);
  if (!nightDesired.ok) return nightDesired;
  const target = parseInteger(values.targetMonthlyWorkDays, "月間出勤目標日数", 0, 31);
  if (!target.ok) return target;
  const cap = parseInteger(values.annualIncomeCapYen, "年収上限 (円)", 0, 100_000_000);
  if (!cap.ok) return cap;

  const days = values.unavailableDaysOfWeek
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  for (const d of days) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return { ok: false, error: "勤務不可曜日の指定が不正です。" };
    }
  }
  const uniqueDays = Array.from(new Set(days)).sort((a, b) => a - b);

  if (values.notes.length > 500) {
    return { ok: false, error: "備考は 500 文字以内で入力してください。" };
  }

  return {
    ok: true,
    data: {
      maxMonthlyWorkMinutes: monthly.minutes,
      maxDailyWorkMinutes: daily.minutes,
      maxNightShiftsPerMonth: nightMax.value,
      allowNightShiftOverride: values.allowNightShiftOverride === "on",
      targetMonthlyWorkDays: target.value,
      annualIncomeCapYen: cap.value,
      halfDayOnly: values.halfDayOnly === "on",
      unavailableDaysOfWeek: uniqueDays,
      notes: values.notes,
    },
    desiredNightShiftsPerMonth: nightDesired.value,
  };
}

export async function upsertShiftConstraint(
  employeeId: string,
  _prev: ShiftConstraintFormState,
  formData: FormData,
): Promise<ShiftConstraintFormState> {
  await requireAdmin();
  const values = readForm(formData);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return { error: "対象の従業員が見つかりませんでした。", values };

  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  // 夜勤希望回数は Employee 列のため、制約 upsert と従業員更新を 1 トランザクションで揃える。
  await prisma.$transaction([
    prisma.shiftConstraint.upsert({
      where: { employeeId },
      create: { employeeId, ...parsed.data, notes: parsed.data.notes || null },
      update: { ...parsed.data, notes: parsed.data.notes || null },
    }),
    prisma.employee.update({
      where: { id: employeeId },
      data: { desiredNightShiftsPerMonth: parsed.desiredNightShiftsPerMonth },
    }),
  ]);

  revalidatePath(`/admin/employees/${employeeId}`);
  return { message: "保存しました。", values };
}
