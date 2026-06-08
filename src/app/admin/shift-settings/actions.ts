"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  validateOfficeShiftSetting,
  type OfficeShiftSettingValues,
} from "@/lib/shift/office-setting";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
