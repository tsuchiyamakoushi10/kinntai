"use server";

import { DayKind } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REQUIRED_COUNT = 99;

// quota 編集対象は勤務系のみ (docs/auto-shift-design.md §3.1)
const WORK_SHIFT_KINDS = new Set(["WORK", "NIGHT_IN", "NIGHT_OUT"]);

export type QuotaInput = {
  shiftPatternId: string;
  dayKind: DayKind;
  requiredCount: number;
};

export type SaveQuotasInput = {
  officeId: string;
  quotas: QuotaInput[];
};

export type SaveQuotasResult = { ok: true; upserted: number } | { ok: false; error: string };

function isDayKind(v: unknown): v is DayKind {
  return v === DayKind.WEEKDAY || v === DayKind.SATURDAY || v === DayKind.SUNDAY_HOLIDAY;
}

/**
 * 拠点の必要人員数マトリクスをまとめて upsert する。
 *
 * 検証:
 *   - office / pattern の UUID と存在
 *   - pattern が勤務系 (work / night_in / night_out) であること
 *   - pattern が「拠点固有 (office_id 一致) または 共通 (office_id IS NULL)」であること
 *   - required_count は 0 以上の整数 (上限 99 = 1 シフトに 99 人で十分過剰)
 *
 * 必要人員数 0 のセルも明示的に upsert する。
 * (空欄 = 0 で持つ方針。delete はしない。docs/auto-shift-design.md §3.1)
 */
export async function saveOfficeShiftQuotas(input: SaveQuotasInput): Promise<SaveQuotasResult> {
  await requireAdmin();

  if (!UUID.test(input.officeId)) {
    return { ok: false, error: "拠点 ID の形式が不正です。" };
  }
  if (!Array.isArray(input.quotas)) {
    return { ok: false, error: "必要人員数の一覧が不正です。" };
  }

  const seen = new Set<string>();
  for (const q of input.quotas) {
    if (!UUID.test(q.shiftPatternId)) {
      return { ok: false, error: "シフトパターン ID の形式が不正です。" };
    }
    if (!isDayKind(q.dayKind)) {
      return { ok: false, error: "日種の値が不正です。" };
    }
    if (
      !Number.isInteger(q.requiredCount) ||
      q.requiredCount < 0 ||
      q.requiredCount > MAX_REQUIRED_COUNT
    ) {
      return {
        ok: false,
        error: `必要人員数は 0〜${MAX_REQUIRED_COUNT} の整数で入力してください。`,
      };
    }
    const key = `${q.shiftPatternId}:${q.dayKind}`;
    if (seen.has(key)) {
      return { ok: false, error: "同じパターン × 日種の重複があります。" };
    }
    seen.add(key);
  }

  // 拠点の存在確認
  const office = await prisma.office.findUnique({
    where: { id: input.officeId },
    select: { id: true },
  });
  if (!office) {
    return { ok: false, error: "拠点が見つかりませんでした。" };
  }

  // 指定された pattern が「勤務系」かつ「拠点固有 or 共通」であることを一括チェック
  const patternIds = Array.from(new Set(input.quotas.map((q) => q.shiftPatternId)));
  if (patternIds.length > 0) {
    const patterns = await prisma.shiftPattern.findMany({
      where: { id: { in: patternIds } },
      select: { id: true, shiftKind: true, officeId: true, isActive: true },
    });
    const byId = new Map(patterns.map((p) => [p.id, p] as const));
    for (const pid of patternIds) {
      const p = byId.get(pid);
      if (!p) {
        return { ok: false, error: "存在しないシフトパターンが含まれています。" };
      }
      if (!p.isActive) {
        return { ok: false, error: "無効化されたシフトパターンには枠を設定できません。" };
      }
      if (!WORK_SHIFT_KINDS.has(p.shiftKind)) {
        return {
          ok: false,
          error: "勤務系 (通常勤務 / 夜入 / 夜明) 以外のパターンには枠を設定できません。",
        };
      }
      if (p.officeId !== null && p.officeId !== input.officeId) {
        return {
          ok: false,
          error: "他拠点のシフトパターンには枠を設定できません。",
        };
      }
    }
  }

  // upsert (delete はしない。0 でも明示的に保持)
  await prisma.$transaction(async (tx) => {
    for (const q of input.quotas) {
      await tx.officeShiftQuota.upsert({
        where: {
          officeId_shiftPatternId_dayKind: {
            officeId: input.officeId,
            shiftPatternId: q.shiftPatternId,
            dayKind: q.dayKind,
          },
        },
        update: { requiredCount: q.requiredCount },
        create: {
          officeId: input.officeId,
          shiftPatternId: q.shiftPatternId,
          dayKind: q.dayKind,
          requiredCount: q.requiredCount,
        },
      });
    }
  });

  revalidatePath("/admin/quotas");

  return { ok: true, upserted: input.quotas.length };
}
