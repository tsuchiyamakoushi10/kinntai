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
import { issueCredentialForEmployee } from "@/lib/issue-login-credential";
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
  nightShiftOnly: boolean;
  nightRequestOnly: boolean;
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
  lastNameKana: string | null;
  firstNameKana: string | null;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  officeId: string | null;
  jobCategory: JobCategory | null;
  employmentType: EmploymentType | null;
  joinedAt: Date | null;
  hiredAt: Date | null;
  weeklyWorkDays: number | null;
  dailyWorkHours: number | null;
  baseWageType: WageType | null;
  baseWageAmount: number | null;
  nightShiftOnly: boolean;
  nightRequestOnly: boolean;
};

function parseAndValidate(
  values: EmployeeFormValues,
): { ok: true; data: Parsed } | { ok: false; error: string } {
  // 必須は「姓」のみ。氏名なしレコードは一覧 UI が壊れるため最低限残す。
  // それ以外は任意 — 値が入っているときだけ形式・範囲を検証する
  // (CSV 取り込み直後など、未入力のまま一部だけ編集して保存できるようにするため)。
  if (!values.lastName) return { ok: false, error: "姓を入力してください。" };
  if (values.lastName.length > 40 || values.firstName.length > 40) {
    return { ok: false, error: "氏名は姓・名それぞれ 40 文字以内で入力してください。" };
  }

  if (values.lastNameKana && !KANA_PATTERN.test(values.lastNameKana)) {
    return { ok: false, error: "姓のフリガナはカタカナで入力してください。" };
  }
  if (values.firstNameKana && !KANA_PATTERN.test(values.firstNameKana)) {
    return { ok: false, error: "名のフリガナはカタカナで入力してください。" };
  }

  if (values.email && !EMAIL_PATTERN.test(values.email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }

  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    return { ok: false, error: "電話番号は数字とハイフン等で 20 文字以内で入力してください。" };
  }

  let birthDate: Date | null = null;
  if (values.birthDate) {
    birthDate = parseDateInputValue(values.birthDate);
    if (!birthDate) return { ok: false, error: "生年月日を正しく入力してください。" };
  }

  if (values.jobCategory && !(values.jobCategory in JobCategory)) {
    return { ok: false, error: "職種の値が不正です。" };
  }
  if (values.employmentType && !(values.employmentType in EmploymentType)) {
    return { ok: false, error: "雇用形態の値が不正です。" };
  }

  let joinedAt: Date | null = null;
  if (values.joinedAt) {
    joinedAt = parseDateInputValue(values.joinedAt);
    if (!joinedAt) return { ok: false, error: "入社日を正しく入力してください。" };
  }
  let hiredAt: Date | null = null;
  if (values.hiredAt) {
    hiredAt = parseDateInputValue(values.hiredAt);
    if (!hiredAt) return { ok: false, error: "雇い入れ日を正しく入力してください。" };
  }

  let weeklyWorkDays: number | null = null;
  if (values.weeklyWorkDays) {
    const n = Number(values.weeklyWorkDays);
    if (!Number.isFinite(n) || n < 0.5 || n > 7) {
      return { ok: false, error: "週所定労働日数は 0.5〜7.0 の範囲で入力してください。" };
    }
    weeklyWorkDays = n;
  }

  let dailyWorkHours: number | null = null;
  if (values.dailyWorkHours) {
    const n = Number(values.dailyWorkHours);
    if (!Number.isFinite(n) || n < 0.5 || n > 12) {
      return { ok: false, error: "1 日の所定労働時間は 0.5〜12.0 の範囲で入力してください。" };
    }
    dailyWorkHours = n;
  }

  if (values.baseWageType && !(values.baseWageType in WageType)) {
    return { ok: false, error: "給与形態の値が不正です。" };
  }

  let baseWageAmount: number | null = null;
  if (values.baseWageAmount) {
    const n = Number(values.baseWageAmount);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: "基本給は 1 円以上の整数で入力してください。" };
    }
    baseWageAmount = n;
  }

  return {
    ok: true,
    data: {
      lastName: values.lastName.trim(),
      firstName: values.firstName.trim(),
      lastNameKana: values.lastNameKana.trim() || null,
      firstNameKana: values.firstNameKana.trim() || null,
      email: values.email.trim().toLowerCase() || null,
      phone: values.phone.trim() || null,
      birthDate,
      officeId: values.officeId || null,
      jobCategory: (values.jobCategory || null) as JobCategory | null,
      employmentType: (values.employmentType || null) as EmploymentType | null,
      joinedAt,
      hiredAt,
      weeklyWorkDays,
      dailyWorkHours,
      baseWageType: (values.baseWageType || null) as WageType | null,
      baseWageAmount,
      nightShiftOnly: values.nightShiftOnly,
      nightRequestOnly: values.nightRequestOnly,
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
    nightShiftOnly: formData.get("nightShiftOnly") === "on",
    nightRequestOnly: formData.get("nightRequestOnly") === "on",
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
          nightShiftOnly: parsed.data.nightShiftOnly,
          nightRequestOnly: parsed.data.nightRequestOnly,
        },
      });
      // メール未入力なら login User は作らない (CSV 取り込み相当の「ログインなし社員」)。
      if (parsed.data.email) {
        await tx.user.create({
          data: {
            email: parsed.data.email,
            passwordHash,
            role: "EMPLOYEE",
            employeeId: employee.id,
          },
        });
      }
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
          nightShiftOnly: parsed.data.nightShiftOnly,
          nightRequestOnly: parsed.data.nightRequestOnly,
        },
      });
      // メールが入力されているときだけ login User を作成 / 更新する。
      // 空欄なら既存アカウントはそのまま (誤って消さない)。
      if (parsed.data.email) {
        await syncUserEmail(tx, id, parsed.data.email);
      }
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

// =============================================================================
// ログイン資格情報の個別再発行
// =============================================================================

export type ReissueCredentialState = {
  error?: string;
  /** 発行できた場合のみ。平文初期パスワードを含むため一度だけ表示する。 */
  issued?: { loginId: string; initialPassword: string };
};

/**
 * 1 名分のログインID / 初期パスワードを再発行する（パスワード失念時の救済）。
 *
 * loginId は既存があれば維持し、パスワードのみ再生成する。結果は state で返し、
 * 詳細画面で一度だけ表示する（DB には平文を保存しない）。
 */
export async function reissueCredential(
  employeeId: string,
  // useActionState 用に (prevState, formData) の形を満たす必要があるが、
  // この発行操作は入力を取らないため両方とも参照しない。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ReissueCredentialState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ReissueCredentialState> {
  await requireAdmin();
  try {
    const { loginId, initialPassword } = await issueCredentialForEmployee(employeeId);
    revalidatePath(`/admin/employees/${employeeId}`);
    return { issued: { loginId, initialPassword } };
  } catch {
    return { error: "ログインの発行に失敗しました。" };
  }
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

/**
 * 休職にする (産休 / 育休 / 病欠など)。自動シフト生成の対象 (ACTIVE) から外れる。
 * 退職と違いログインや雇用情報はそのまま (一時的な離脱)。
 */
export async function setEmployeeOnLeave(id: string): Promise<void> {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { employmentStatus: true },
  });
  if (!employee) redirect(`/admin/employees`);
  if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
    redirect(`/admin/employees/${id}`);
  }
  await prisma.employee.update({
    where: { id },
    data: { employmentStatus: EmploymentStatus.ON_LEAVE },
  });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  redirect(`/admin/employees/${id}`);
}

/** 休職から復帰 (ACTIVE に戻す)。 */
export async function returnEmployeeFromLeave(id: string): Promise<void> {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { employmentStatus: true },
  });
  if (!employee) redirect(`/admin/employees`);
  if (employee.employmentStatus !== EmploymentStatus.ON_LEAVE) {
    redirect(`/admin/employees/${id}`);
  }
  await prisma.employee.update({
    where: { id },
    data: { employmentStatus: EmploymentStatus.ACTIVE },
  });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  redirect(`/admin/employees/${id}`);
}
