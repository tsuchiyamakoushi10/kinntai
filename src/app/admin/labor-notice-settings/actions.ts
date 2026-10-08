"use server";

import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";
import { MIN_WAGES } from "@/lib/labor-notice/constants";
import { loadNoticeSettings } from "@/lib/labor-notice/load";
import { checkMinWage, checkPreset, checkWorkPatterns } from "@/lib/labor-notice/masters";
import type { NoticeEmploymentType } from "@/lib/labor-notice/types";

export type SettingsResult = { ok: true } | { ok: false; error: string };

const TYPES: ReadonlyArray<NoticeEmploymentType> = ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"];

function done(): SettingsResult {
  revalidatePath("/admin/labor-notice-settings");
  revalidatePath("/admin/labor-notices/new");
  return { ok: true };
}

/** 区分ごとの初期値を保存する */
export async function saveNoticePreset(type: string, value: unknown): Promise<SettingsResult> {
  await requireAdmin();
  const noticeType = TYPES.find((t) => t === type);
  if (!noticeType) return { ok: false, error: "区分が不正です" };
  const settings = await loadNoticeSettings();
  const checked = checkPreset(
    value,
    settings.patterns.map((p) => p.code),
  );
  if (!checked.ok) return checked;
  const p = checked.value;
  const data = {
    texts: p.texts as unknown as Prisma.InputJsonValue,
    defaultFixedTermMonths: p.defaultFixedTermMonths,
    convertsToIndefinite: p.convertsToIndefinite,
    defaultPatternCodes: [...p.defaultPatternCodes],
    allowanceRows: p.allowanceRows as unknown as Prisma.InputJsonValue,
    qualificationAllowances: p.qualificationAllowances as unknown as Prisma.InputJsonValue,
  };
  await prisma.laborNoticePreset.upsert({
    where: { noticeType },
    create: { noticeType, ...data },
    update: data,
  });
  return done();
}

/** 区分の初期値を、最初の設定 (プログラムの既定値) に戻す */
export async function resetNoticePreset(type: string): Promise<SettingsResult> {
  await requireAdmin();
  const noticeType = TYPES.find((t) => t === type);
  if (!noticeType) return { ok: false, error: "区分が不正です" };
  await prisma.laborNoticePreset.deleteMany({ where: { noticeType } });
  return done();
}

/** 勤務パターンの一覧を保存する。削除はせず「使わない」にする (下書きが参照しているため) */
export async function saveNoticeWorkPatterns(value: unknown): Promise<SettingsResult> {
  await requireAdmin();
  const checked = checkWorkPatterns(value);
  if (!checked.ok) return checked;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.laborNoticeWorkPattern.findMany({ select: { code: true } });
    const codes = new Set(existing.map((e) => e.code));
    for (const [i, p] of checked.value.entries()) {
      const code = p.code || `P${randomBytes(4).toString("hex").toUpperCase()}`;
      const data = {
        label: p.label,
        startTime: p.start,
        endTime: p.end,
        endsNextDay: p.endsNextDay,
        breakMinutes: p.breakMinutes,
        sortOrder: i * 10,
        isActive: p.isActive,
      };
      if (codes.has(code)) {
        await tx.laborNoticeWorkPattern.update({ where: { code }, data });
      } else {
        await tx.laborNoticeWorkPattern.create({ data: { code, ...data } });
      }
    }
  });
  return done();
}

/** 既定値で表示している最低賃金を DB に書き出す (最初の追加・削除の前に呼ぶ) */
async function ensureMinWagesSaved(tx: Prisma.TransactionClient): Promise<void> {
  if ((await tx.minWage.count()) > 0) return;
  await tx.minWage.createMany({
    data: MIN_WAGES.map((w) => ({
      prefecture: w.prefecture,
      yen: w.yen,
      effectiveFrom: parseDateInputValue(w.effectiveFrom) ?? new Date(w.effectiveFrom),
    })),
    skipDuplicates: true,
  });
}

export async function addMinWage(value: unknown): Promise<SettingsResult> {
  await requireAdmin();
  const checked = checkMinWage(value);
  if (!checked.ok) return checked;
  const effectiveFrom = parseDateInputValue(checked.value.effectiveFrom);
  if (!effectiveFrom) return { ok: false, error: "発効日を入力してください" };
  await prisma.$transaction(async (tx) => {
    await ensureMinWagesSaved(tx);
    await tx.minWage.upsert({
      where: { prefecture_effectiveFrom: { prefecture: checked.value.prefecture, effectiveFrom } },
      create: { prefecture: checked.value.prefecture, yen: checked.value.yen, effectiveFrom },
      update: { yen: checked.value.yen },
    });
  });
  return done();
}

export async function deleteMinWage(
  prefecture: string,
  effectiveFromYmd: string,
): Promise<SettingsResult> {
  await requireAdmin();
  const effectiveFrom = parseDateInputValue(effectiveFromYmd);
  if (!effectiveFrom) return { ok: false, error: "発効日が不正です" };
  await prisma.$transaction(async (tx) => {
    await ensureMinWagesSaved(tx);
    await tx.minWage.deleteMany({ where: { prefecture, effectiveFrom } });
  });
  return done();
}
