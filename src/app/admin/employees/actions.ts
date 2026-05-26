"use server";

import {
  EmploymentStatus,
  EmploymentType,
  JobCategory,
  Prisma,
  WageType,
  type PrismaClient,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { hashPin, isValidPinFormat } from "@/lib/pin";
import { parseDateInputValue } from "@/lib/format";

import { DEFAULT_INITIAL_PASSWORD } from "./constants";

export type EmployeeFormValues = {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  email: string;
  phone: string;
  birthDate: string; // YYYY-MM-DD
  officeId: string;
  jobCategory: string;
  employmentType: string;
  joinedAt: string;
  hiredAt: string;
  weeklyWorkDays: string;
  dailyWorkHours: string;
  baseWageType: string;
  baseWageAmount: string;
};

export type EmployeeFormState = {
  error?: string;
  values?: EmployeeFormValues;
};

const KANA_PATTERN = /^[゠-ヿーｦ-ﾟ\s]+$/u; // カタカナ + 長音 + 半角カナ
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-()\s]{0,20}$/;

type Parsed = {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  email: string;
  phone: string;
  birthDate: Date;
  officeId: string;
  jobCategory: JobCategory;
  employmentType: EmploymentType;
  joinedAt: Date;
  hiredAt: Date;
  weeklyWorkDays: number;
  dailyWorkHours: number;
  baseWageType: WageType;
  baseWageAmount: number;
};

function parseAndValidate(
  values: EmployeeFormValues,
): { ok: true; data: Parsed } | { ok: false; error: string } {
  if (!values.lastName) return { ok: false, error: "姓を入力してください。" };
  if (!values.firstName) return { ok: false, error: "名を入力してください。" };
  if (values.lastName.length > 40 || values.firstName.length > 40) {
    return { ok: false, error: "氏名は姓・名それぞれ 40 文字以内で入力してください。" };
  }

  if (!values.lastNameKana || !values.firstNameKana) {
    return { ok: false, error: "フリガナを入力してください。" };
  }
  if (!KANA_PATTERN.test(values.lastNameKana) || !KANA_PATTERN.test(values.firstNameKana)) {
    return { ok: false, error: "フリガナはカタカナで入力してください。" };
  }

  if (!EMAIL_PATTERN.test(values.email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }

  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    return { ok: false, error: "電話番号は数字とハイフン等で 20 文字以内で入力してください。" };
  }

  const birthDate = parseDateInputValue(values.birthDate);
  if (!birthDate) return { ok: false, error: "生年月日を正しく入力してください。" };

  if (!values.officeId) return { ok: false, error: "所属拠点を選択してください。" };

  if (!(values.jobCategory in JobCategory)) {
    return { ok: false, error: "職種を選択してください。" };
  }
  if (!(values.employmentType in EmploymentType)) {
    return { ok: false, error: "雇用形態を選択してください。" };
  }

  const joinedAt = parseDateInputValue(values.joinedAt);
  const hiredAt = parseDateInputValue(values.hiredAt);
  if (!joinedAt) return { ok: false, error: "入社日を正しく入力してください。" };
  if (!hiredAt) return { ok: false, error: "雇い入れ日を正しく入力してください。" };

  const weeklyWorkDays = Number(values.weeklyWorkDays);
  if (!Number.isFinite(weeklyWorkDays) || weeklyWorkDays < 0.5 || weeklyWorkDays > 7) {
    return { ok: false, error: "週所定労働日数は 0.5〜7.0 の範囲で入力してください。" };
  }

  const dailyWorkHours = Number(values.dailyWorkHours);
  if (!Number.isFinite(dailyWorkHours) || dailyWorkHours < 0.5 || dailyWorkHours > 12) {
    return { ok: false, error: "1 日の所定労働時間は 0.5〜12.0 の範囲で入力してください。" };
  }

  if (!(values.baseWageType in WageType)) {
    return { ok: false, error: "給与形態（時給 / 月給）を選択してください。" };
  }

  const baseWageAmount = Number(values.baseWageAmount);
  if (!Number.isInteger(baseWageAmount) || baseWageAmount <= 0) {
    return { ok: false, error: "基本給は 1 円以上の整数で入力してください。" };
  }

  return {
    ok: true,
    data: {
      lastName: values.lastName.trim(),
      firstName: values.firstName.trim(),
      lastNameKana: values.lastNameKana.trim(),
      firstNameKana: values.firstNameKana.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      birthDate,
      officeId: values.officeId,
      jobCategory: values.jobCategory as JobCategory,
      employmentType: values.employmentType as EmploymentType,
      joinedAt,
      hiredAt,
      weeklyWorkDays,
      dailyWorkHours,
      baseWageType: values.baseWageType as WageType,
      baseWageAmount,
    },
  };
}

function valuesFromForm(formData: FormData): EmployeeFormValues {
  const get = (k: string): string => String(formData.get(k) ?? "").trim();
  return {
    lastName: get("lastName"),
    firstName: get("firstName"),
    lastNameKana: get("lastNameKana"),
    firstNameKana: get("firstNameKana"),
    email: get("email"),
    phone: get("phone"),
    birthDate: get("birthDate"),
    officeId: get("officeId"),
    jobCategory: get("jobCategory"),
    employmentType: get("employmentType"),
    joinedAt: get("joinedAt"),
    hiredAt: get("hiredAt"),
    weeklyWorkDays: get("weeklyWorkDays"),
    dailyWorkHours: get("dailyWorkHours"),
    baseWageType: get("baseWageType"),
    baseWageAmount: get("baseWageAmount"),
  };
}

/**
 * 既存の "E####" 系コードのうち最大番号 + 1 を返す。
 * 単純な実装で並行作成にはレースがあるが、admin 同時投入の頻度は低い
 * ためコストに見合わない最適化はしない。重複時は P2002 を握ってリトライ
 * すれば回避可能。
 */
async function nextEmployeeCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.employee.findFirst({
    where: { employeeCode: { startsWith: "E" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });
  const lastNum = last ? Number.parseInt(last.employeeCode.slice(1), 10) : 0;
  const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
  return `E${String(next).padStart(4, "0")}`;
}

function emailIsTaken(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== "P2002") return false;
  const target = (e.meta as { target?: string | string[] } | undefined)?.target;
  const t = Array.isArray(target) ? target.join(",") : (target ?? "");
  return t.includes("email");
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireAdmin();
  const values = valuesFromForm(formData);
  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  const passwordHash = await hashPassword(DEFAULT_INITIAL_PASSWORD);

  let newId: string;
  try {
    newId = await prisma.$transaction(async (tx) => {
      const code = await nextEmployeeCode(tx);
      const employee = await tx.employee.create({
        data: {
          employeeCode: code,
          lastName: parsed.data.lastName,
          firstName: parsed.data.firstName,
          lastNameKana: parsed.data.lastNameKana,
          firstNameKana: parsed.data.firstNameKana,
          phone: parsed.data.phone || null,
          birthDate: parsed.data.birthDate,
          officeId: parsed.data.officeId,
          jobCategory: parsed.data.jobCategory,
          employmentType: parsed.data.employmentType,
          joinedAt: parsed.data.joinedAt,
          hiredAt: parsed.data.hiredAt,
          weeklyWorkDays: parsed.data.weeklyWorkDays,
          dailyWorkHours: parsed.data.dailyWorkHours,
          baseWageType: parsed.data.baseWageType,
          baseWageAmount: parsed.data.baseWageAmount,
        },
      });
      await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          role: "EMPLOYEE",
          employeeId: employee.id,
        },
      });
      return employee.id;
    });
  } catch (e) {
    if (emailIsTaken(e)) {
      return { error: "このメールアドレスはすでに使われています。", values };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { error: "選択した拠点が見つかりませんでした。", values };
    }
    throw e;
  }

  revalidatePath("/admin/employees");
  redirect(`/admin/employees/${newId}?created=1`);
}

async function syncUserEmail(
  tx: PrismaClient | Prisma.TransactionClient,
  employeeId: string,
  email: string,
): Promise<void> {
  const existing = await tx.user.findUnique({ where: { employeeId } });
  if (!existing) {
    // 既存従業員に紐づく User が無いケース（マイグレーション以前の seed など）。
    // この経路は普段は通らないが、データ整合を保つために作る。
    const passwordHash = await hashPassword(DEFAULT_INITIAL_PASSWORD);
    await tx.user.create({
      data: {
        email,
        passwordHash,
        role: "EMPLOYEE",
        employeeId,
      },
    });
    return;
  }
  if (existing.email === email) return;
  await tx.user.update({ where: { id: existing.id }, data: { email } });
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireAdmin();
  const values = valuesFromForm(formData);
  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          lastName: parsed.data.lastName,
          firstName: parsed.data.firstName,
          lastNameKana: parsed.data.lastNameKana,
          firstNameKana: parsed.data.firstNameKana,
          phone: parsed.data.phone || null,
          birthDate: parsed.data.birthDate,
          officeId: parsed.data.officeId,
          jobCategory: parsed.data.jobCategory,
          employmentType: parsed.data.employmentType,
          joinedAt: parsed.data.joinedAt,
          hiredAt: parsed.data.hiredAt,
          weeklyWorkDays: parsed.data.weeklyWorkDays,
          dailyWorkHours: parsed.data.dailyWorkHours,
          baseWageType: parsed.data.baseWageType,
          baseWageAmount: parsed.data.baseWageAmount,
        },
      });
      await syncUserEmail(tx, id, parsed.data.email);
    });
  } catch (e) {
    if (emailIsTaken(e)) {
      return { error: "このメールアドレスはすでに使われています。", values };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return { error: "対象の従業員が見つかりませんでした。", values };
      }
      if (e.code === "P2003") {
        return { error: "選択した拠点が見つかりませんでした。", values };
      }
    }
    throw e;
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  redirect(`/admin/employees/${id}`);
}

// =============================================================================
// 退職処理 / 復職処理（S-A-06）
// =============================================================================

export type RetireFormState = {
  error?: string;
  values?: {
    retiredAt: string;
    retirementReason: string;
    notes: string;
  };
};

/**
 * 退職日を確定し、紐づくログインアカウントを無効化する。
 *
 * employment_status を RETIRED に遷移し、retired_at と retirement_reason を埋める。
 * 有給失効処理は Phase 3 (src/lib/leave/) に集約予定のため、ここでは触らない。
 */
export async function retireEmployee(
  id: string,
  _prev: RetireFormState,
  formData: FormData,
): Promise<RetireFormState> {
  await requireAdmin();
  const values: NonNullable<RetireFormState["values"]> = {
    retiredAt: String(formData.get("retiredAt") ?? "").trim(),
    retirementReason: String(formData.get("retirementReason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  const retiredAt = parseDateInputValue(values.retiredAt);
  if (!retiredAt) {
    return { error: "退職日を正しく入力してください。", values };
  }
  if (!values.retirementReason) {
    return { error: "退職理由を入力してください。", values };
  }
  if (values.retirementReason.length > 200) {
    return { error: "退職理由は 200 文字以内で入力してください。", values };
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { hiredAt: true, employmentStatus: true, notes: true },
  });
  if (!employee) {
    return { error: "対象の従業員が見つかりませんでした。", values };
  }
  if (employee.employmentStatus === EmploymentStatus.RETIRED) {
    return { error: "この従業員はすでに退職処理されています。", values };
  }
  // 雇い入れ日が未登録 (CSV 取り込み直後等) の場合は前後判定をスキップ。
  if (employee.hiredAt !== null && retiredAt < employee.hiredAt) {
    return { error: "退職日は雇い入れ日以降の日付にしてください。", values };
  }

  const mergedNotes = [employee.notes, values.notes].filter(Boolean).join("\n").trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        employmentStatus: EmploymentStatus.RETIRED,
        retiredAt,
        retirementReason: values.retirementReason,
        notes: mergedNotes,
      },
    });
    // ログインアカウントの停止（PII 漏洩防止 + 退職者アクセス遮断）
    await tx.user.updateMany({
      where: { employeeId: id },
      data: { isActive: false },
    });
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin/employees/retired");
  revalidatePath(`/admin/employees/${id}`);
  redirect(`/admin/employees/${id}`);
}

// =============================================================================
// 共有タブレット用 暗証番号 (PIN)
// =============================================================================

export type TabletPinFormState = {
  error?: string;
  message?: string;
};

/**
 * 共有タブレット打刻用の 4 桁暗証番号を設定する。
 *
 * 既存ハッシュがあれば上書きする。空欄なら無効化（NULL）。
 */
export async function setEmployeeTabletPin(
  employeeId: string,
  _prev: TabletPinFormState,
  formData: FormData,
): Promise<TabletPinFormState> {
  await requireAdmin();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!isValidPinFormat(pin)) {
    return { error: "暗証番号は 4 桁の数字で入力してください。" };
  }

  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true },
  });
  if (!user) {
    return { error: "ログインアカウントが見つかりませんでした。" };
  }

  const pinCodeHash = await hashPin(pin);
  await prisma.user.update({
    where: { id: user.id },
    data: { pinCodeHash },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return { message: "暗証番号を更新しました。" };
}

/** 暗証番号を無効化する（NULL にする）。タブレット打刻不可になる。 */
export async function clearEmployeeTabletPin(employeeId: string): Promise<void> {
  await requireAdmin();
  await prisma.user.updateMany({
    where: { employeeId },
    data: { pinCodeHash: null },
  });
  revalidatePath(`/admin/employees/${employeeId}`);
}

/**
 * 退職を取り消す。誤操作の救済用。
 *
 * employment_status を ACTIVE に戻し、retired_at / retirement_reason をクリアし、
 * ログインアカウントを再有効化する。退職時に上書きした notes は戻さない（業務記録として残す）。
 */
export async function unretireEmployee(id: string): Promise<void> {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { employmentStatus: true },
  });
  if (!employee) {
    redirect(`/admin/employees`);
  }
  if (employee.employmentStatus !== EmploymentStatus.RETIRED) {
    redirect(`/admin/employees/${id}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        employmentStatus: EmploymentStatus.ACTIVE,
        retiredAt: null,
        retirementReason: null,
      },
    });
    await tx.user.updateMany({
      where: { employeeId: id },
      data: { isActive: true },
    });
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin/employees/retired");
  revalidatePath(`/admin/employees/${id}`);
  redirect(`/admin/employees/${id}`);
}
