"use server";

import { Prisma, type ShiftKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { shiftKindHasTime } from "@/lib/shift-labels";

const CODE_PATTERN = /^[A-Z0-9_-]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const SHIFT_KINDS: ReadonlyArray<ShiftKind> = [
  "WORK",
  "NIGHT_IN",
  "NIGHT_OUT",
  "OFF",
  "PAID_LEAVE",
  "ABSENCE",
  "REQUESTED_OFF",
];

export type ShiftPatternFormValues = {
  code: string;
  name: string;
  officeId: string; // "" = 全拠点共通
  shiftKind: string;
  startTime: string; // "HH:MM" または ""
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: string;
  paidLeaveUnits: string;
  color: string;
  sortOrder: string;
  isActive: boolean;
};

export type ShiftPatternFormState = {
  error?: string;
  values?: ShiftPatternFormValues;
};

type Parsed = {
  code: string;
  name: string;
  officeId: string | null;
  shiftKind: ShiftKind;
  startTime: Date | null;
  endTime: Date | null;
  crossesMidnight: boolean;
  breakMinutes: number;
  paidLeaveUnits: number;
  color: string;
  sortOrder: number;
  isActive: boolean;
};

function valuesFromForm(formData: FormData): ShiftPatternFormValues {
  const get = (k: string): string => String(formData.get(k) ?? "").trim();
  return {
    code: get("code").toUpperCase(),
    name: get("name"),
    officeId: get("officeId"),
    shiftKind: get("shiftKind"),
    startTime: get("startTime"),
    endTime: get("endTime"),
    crossesMidnight: formData.get("crossesMidnight") === "on",
    breakMinutes: get("breakMinutes"),
    paidLeaveUnits: get("paidLeaveUnits"),
    color: get("color"),
    sortOrder: get("sortOrder"),
    isActive: formData.get("isActive") === "on",
  };
}

/**
 * "HH:MM" を `@db.Time(0)` に渡せる Date に変換する。Prisma は UTC 1970-01-01 の
 * 時刻成分のみを保存する。
 */
function parseHhmm(s: string): Date | null {
  if (!HHMM_PATTERN.test(s)) return null;
  return new Date(`1970-01-01T${s}:00.000Z`);
}

function parse(
  v: ShiftPatternFormValues,
): { ok: true; data: Parsed } | { ok: false; error: string } {
  if (!v.code) return { ok: false, error: "コードを入力してください。" };
  if (v.code.length > 32) return { ok: false, error: "コードは 32 文字以内で入力してください。" };
  if (!CODE_PATTERN.test(v.code)) {
    return {
      ok: false,
      error: "コードは英大文字・数字・ハイフン・アンダースコアのみ使えます。",
    };
  }
  if (!v.name) return { ok: false, error: "名称を入力してください。" };
  if (v.name.length > 50) return { ok: false, error: "名称は 50 文字以内で入力してください。" };

  if (!(SHIFT_KINDS as ReadonlyArray<string>).includes(v.shiftKind)) {
    return { ok: false, error: "種別を選択してください。" };
  }
  const shiftKind = v.shiftKind as ShiftKind;

  const needsTime = shiftKindHasTime(shiftKind);
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  if (needsTime) {
    startTime = parseHhmm(v.startTime);
    endTime = parseHhmm(v.endTime);
    if (!startTime || !endTime) {
      return { ok: false, error: "開始 / 終了時刻を HH:MM で入力してください。" };
    }
  } else if (v.startTime || v.endTime) {
    // 公休・有休等は時刻不要。空にする。
    startTime = null;
    endTime = null;
  }

  const breakMinutes = Number(v.breakMinutes || "0");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
    return { ok: false, error: "休憩分は 0〜480 の整数で入力してください。" };
  }

  const paidLeaveUnits = Number(v.paidLeaveUnits || "0");
  if (!Number.isFinite(paidLeaveUnits) || paidLeaveUnits < 0 || paidLeaveUnits > 1) {
    return { ok: false, error: "有給消化単位は 0.0〜1.0 の範囲で入力してください。" };
  }

  const color = v.color || "#888888";
  if (!COLOR_PATTERN.test(color)) {
    return { ok: false, error: "色は #RRGGBB 形式で入力してください。" };
  }

  const sortOrder = Number(v.sortOrder || "0");
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return { ok: false, error: "並び順は 0〜9999 の整数で入力してください。" };
  }

  return {
    ok: true,
    data: {
      code: v.code,
      name: v.name,
      officeId: v.officeId || null,
      shiftKind,
      startTime,
      endTime,
      crossesMidnight: needsTime ? v.crossesMidnight : false,
      breakMinutes,
      paidLeaveUnits,
      color,
      sortOrder,
      isActive: v.isActive,
    },
  };
}

function codeIsTaken(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return e.code === "P2002";
}

export async function createShiftPattern(
  _prev: ShiftPatternFormState,
  formData: FormData,
): Promise<ShiftPatternFormState> {
  await requireAdmin();
  const values = valuesFromForm(formData);
  const parsed = parse(values);
  if (!parsed.ok) return { error: parsed.error, values };

  try {
    await prisma.shiftPattern.create({ data: parsed.data });
  } catch (e) {
    if (codeIsTaken(e)) {
      return { error: "このコードはすでに使われています。", values };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { error: "選択した拠点が見つかりませんでした。", values };
    }
    throw e;
  }

  revalidatePath("/admin/shift-patterns");
  redirect("/admin/shift-patterns");
}

export async function updateShiftPattern(
  id: string,
  _prev: ShiftPatternFormState,
  formData: FormData,
): Promise<ShiftPatternFormState> {
  await requireAdmin();
  const values = valuesFromForm(formData);
  const parsed = parse(values);
  if (!parsed.ok) return { error: parsed.error, values };

  try {
    await prisma.shiftPattern.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (codeIsTaken(e)) {
      return { error: "このコードはすでに使われています。", values };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return { error: "対象のシフトパターンが見つかりませんでした。", values };
      }
      if (e.code === "P2003") {
        return { error: "選択した拠点が見つかりませんでした。", values };
      }
    }
    throw e;
  }

  revalidatePath("/admin/shift-patterns");
  redirect("/admin/shift-patterns");
}

/**
 * 物理削除はしない。勤務表 (shifts) や打刻 (attendance_records) で参照されているため、
 * 非表示にしたいときは isActive を切り替える。
 */
export async function toggleShiftPatternActive(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  await prisma.shiftPattern.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/shift-patterns");
  redirect("/admin/shift-patterns");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PatternReorderResult = { ok: true } | { ok: false; error: string };

/**
 * シフトパターンの表示順 (sortOrder) を手動並べ替えで保存する。
 * 並べ替え後の id 配列を受け取り、その順で sortOrder = (index+1)*10 を振る。
 * 勤務表のパレット/凡例・一覧の並びに反映される。
 */
export async function saveShiftPatternOrder(orderedIds: string[]): Promise<PatternReorderResult> {
  await requireAdmin();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "並び順の指定が空です。" };
  }
  if (orderedIds.some((id) => !UUID.test(id))) {
    return { ok: false, error: "ID の形式が不正です。" };
  }
  const found = await prisma.shiftPattern.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true },
  });
  const valid = new Set(found.map((p) => p.id));
  if (orderedIds.some((id) => !valid.has(id))) {
    return { ok: false, error: "存在しないパターンが含まれています。" };
  }
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.shiftPattern.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } }),
    ),
  );
  revalidatePath("/admin/shift-patterns");
  revalidatePath("/admin/shifts");
  return { ok: true };
}
