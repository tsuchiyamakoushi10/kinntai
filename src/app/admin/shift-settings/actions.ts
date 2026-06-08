"use server";

import { revalidatePath } from "next/cache";

import type { DayKind } from "@prisma/client";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  validateOfficeShiftSetting,
  type OfficeShiftSettingValues,
} from "@/lib/shift/office-setting";
import {
  DAY_KINDS,
  validateCoverageDemand,
  type CoverageDemandValues,
} from "@/lib/shift/coverage-demand";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_DAY_KINDS = new Set<string>(DAY_KINDS);

export type SaveOfficeShiftSettingInput = {
  officeId: string;
  values: OfficeShiftSettingValues;
};

export type SaveOfficeShiftSettingResult = { ok: true } | { ok: false; error: string };

/**
 * 拠点の自動作成設定 (連勤上限・夜勤上限既定・年収上限既定) を upsert する。
 *
 * 行が無ければ作成、あれば更新。値の検証は純粋関数 validateOfficeShiftSetting に委譲。
 */
export async function saveOfficeShiftSetting(
  input: SaveOfficeShiftSettingInput,
): Promise<SaveOfficeShiftSettingResult> {
  await requireAdmin();

  if (!UUID.test(input.officeId)) {
    return { ok: false, error: "拠点 ID の形式が不正です。" };
  }

  const validated = validateOfficeShiftSetting(input.values);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const office = await prisma.office.findUnique({
    where: { id: input.officeId },
    select: { id: true },
  });
  if (!office) {
    return { ok: false, error: "拠点が見つかりませんでした。" };
  }

  const { maxConsecutiveWorkDays, defaultMaxNightShiftsPerMonth, defaultAnnualIncomeCapYen } =
    validated.values;

  await prisma.officeShiftSetting.upsert({
    where: { officeId: input.officeId },
    update: {
      maxConsecutiveWorkDays,
      defaultMaxNightShiftsPerMonth,
      defaultAnnualIncomeCapYen,
    },
    create: {
      officeId: input.officeId,
      maxConsecutiveWorkDays,
      defaultMaxNightShiftsPerMonth,
      defaultAnnualIncomeCapYen,
    },
  });

  revalidatePath("/admin/shift-settings");

  return { ok: true };
}

// =============================================================================
// 配置基準 (午前/午後) — office_coverage_demands (案A)
// =============================================================================

export type SaveCoverageDemandInput = {
  officeId: string;
  /** 日種ごとの配置基準。通常 3 日種 (平日/土/日祝) ぶん。 */
  demands: { dayKind: DayKind; values: CoverageDemandValues }[];
};

export type SaveCoverageDemandResult = { ok: true } | { ok: false; error: string };

/**
 * 拠点の配置基準 (午前/午後・相談員・夜勤) を日種ごとに upsert する。
 * 各日種の値検証は純粋関数 validateCoverageDemand に委譲。
 */
export async function saveOfficeCoverageDemand(
  input: SaveCoverageDemandInput,
): Promise<SaveCoverageDemandResult> {
  await requireAdmin();

  if (!UUID.test(input.officeId)) {
    return { ok: false, error: "拠点 ID の形式が不正です。" };
  }
  if (!Array.isArray(input.demands) || input.demands.length === 0) {
    return { ok: false, error: "配置基準の一覧が不正です。" };
  }

  const seen = new Set<string>();
  const normalized: { dayKind: DayKind; values: CoverageDemandValues }[] = [];
  for (const d of input.demands) {
    if (!VALID_DAY_KINDS.has(d.dayKind)) {
      return { ok: false, error: "日種の値が不正です。" };
    }
    if (seen.has(d.dayKind)) {
      return { ok: false, error: "同じ日種が重複しています。" };
    }
    seen.add(d.dayKind);
    const v = validateCoverageDemand(d.values);
    if (!v.ok) {
      return { ok: false, error: `${DAY_KIND_ERROR_LABEL[d.dayKind]}: ${v.error}` };
    }
    normalized.push({ dayKind: d.dayKind, values: v.values });
  }

  const office = await prisma.office.findUnique({
    where: { id: input.officeId },
    select: { id: true },
  });
  if (!office) {
    return { ok: false, error: "拠点が見つかりませんでした。" };
  }

  await prisma.$transaction(
    normalized.map((d) =>
      prisma.officeCoverageDemand.upsert({
        where: { officeId_dayKind: { officeId: input.officeId, dayKind: d.dayKind } },
        update: d.values,
        create: { officeId: input.officeId, dayKind: d.dayKind, ...d.values },
      }),
    ),
  );

  revalidatePath("/admin/shift-settings");

  return { ok: true };
}

const DAY_KIND_ERROR_LABEL: Record<DayKind, string> = {
  WEEKDAY: "平日",
  SATURDAY: "土",
  SUNDAY_HOLIDAY: "日祝",
};
