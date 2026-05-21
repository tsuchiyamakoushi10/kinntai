"use server";

import { revalidatePath } from "next/cache";

import { fromJstYmd, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { generateMonthlyShifts } from "@/lib/shift/auto-generator";

import { loadGenerateInput } from "./data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALGORITHM_VERSION = "greedy-v1";

export type AutoRunResult =
  | { ok: true; proposedCount: number; warningCount: number }
  | { ok: false; error: string };

/**
 * 自動作成を下書き保存する。
 *
 * 流れ:
 *   1. 既存 run が CONFIRMED ならエラー (確定取り消しを先に)
 *   2. dry-run で proposedShifts / warnings / stats を計算
 *   3. ShiftGenerationRun を upsert (status=draft)
 *   4. 既存 shifts のうち「自動配置由来かつ未編集」を削除
 *   5. 新しい proposedShifts を upsert (generation_run_id, created_by = generated_by)
 *
 * 保護対象は data.ts で自動的に existingShifts に含めて placement に渡しているため、
 * 自動配置側でそれらを上書きすることはない。
 */
export async function saveDraftRun(input: {
  officeId: string;
  ym: string;
  seed: number;
}): Promise<AutoRunResult> {
  const session = await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };

  const range = monthRange(input.ym);
  const userId = session.user.id;

  // 既存 run の状態をチェック
  const existingRun = await prisma.shiftGenerationRun.findUnique({
    where: {
      officeId_targetMonth: { officeId: input.officeId, targetMonth: range.start },
    },
    select: { id: true, status: true, generatedById: true },
  });
  if (existingRun?.status === "CONFIRMED") {
    return {
      ok: false,
      error: "この月は確定済です。再生成するには確定取り消しを先に行ってください。",
    };
  }

  // 入力データ + dry-run
  const genInput = await loadGenerateInput(input.officeId, input.ym, input.seed, ALGORITHM_VERSION);
  const result = generateMonthlyShifts(genInput);

  await prisma.$transaction(async (tx) => {
    // 1) run を upsert (新規 / 上書き)
    const run = await tx.shiftGenerationRun.upsert({
      where: {
        officeId_targetMonth: {
          officeId: input.officeId,
          targetMonth: range.start,
        },
      },
      create: {
        officeId: input.officeId,
        targetMonth: range.start,
        status: "DRAFT",
        algorithmVersion: ALGORITHM_VERSION,
        generatedById: userId,
        stats: JSON.parse(JSON.stringify(result.stats)),
      },
      update: {
        status: "DRAFT",
        algorithmVersion: ALGORITHM_VERSION,
        generatedById: userId,
        generatedAt: new Date(),
        confirmedAt: null,
        stats: JSON.parse(JSON.stringify(result.stats)),
      },
    });

    // 2) 既存 run 由来 + 未編集の shifts を削除
    if (existingRun) {
      await tx.shift.deleteMany({
        where: {
          officeId: input.officeId,
          workDate: { gte: range.start, lt: range.end },
          generationRunId: existingRun.id,
          updatedBy: existingRun.generatedById,
        },
      });
    }

    // 3) 新規 proposedShifts を upsert
    for (const p of result.proposedShifts) {
      await tx.shift.upsert({
        where: {
          employeeId_workDate: {
            employeeId: p.employeeId,
            workDate: fromJstYmd(p.workDate),
          },
        },
        update: {
          shiftPatternId: p.shiftPatternId,
          generationRunId: run.id,
          updatedBy: userId,
          officeId: input.officeId,
        },
        create: {
          employeeId: p.employeeId,
          officeId: input.officeId,
          workDate: fromJstYmd(p.workDate),
          shiftPatternId: p.shiftPatternId,
          generationRunId: run.id,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }
  });

  revalidatePath("/admin/shifts/auto");
  revalidatePath("/admin/shifts");

  return {
    ok: true,
    proposedCount: result.proposedShifts.length,
    warningCount: result.warnings.length,
  };
}

/** draft → confirmed に状態遷移 (shifts は触らない、メタ情報のみ)。 */
export async function confirmRun(input: { officeId: string; ym: string }): Promise<AutoRunResult> {
  await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };

  const range = monthRange(input.ym);
  const run = await prisma.shiftGenerationRun.findUnique({
    where: { officeId_targetMonth: { officeId: input.officeId, targetMonth: range.start } },
    select: { id: true, status: true },
  });
  if (!run) return { ok: false, error: "この月の自動作成結果がありません。" };
  if (run.status === "CONFIRMED") return { ok: false, error: "既に確定済です。" };

  await prisma.shiftGenerationRun.update({
    where: { id: run.id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  revalidatePath("/admin/shifts/auto");
  revalidatePath("/admin/shifts");

  return { ok: true, proposedCount: 0, warningCount: 0 };
}

/** confirmed → draft に戻す。shifts は触らない (再実行する場合は別途 saveDraftRun)。 */
export async function unconfirmRun(input: {
  officeId: string;
  ym: string;
}): Promise<AutoRunResult> {
  await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };

  const range = monthRange(input.ym);
  const run = await prisma.shiftGenerationRun.findUnique({
    where: { officeId_targetMonth: { officeId: input.officeId, targetMonth: range.start } },
    select: { id: true, status: true },
  });
  if (!run) return { ok: false, error: "この月の自動作成結果がありません。" };
  if (run.status === "DRAFT") return { ok: false, error: "下書き状態です。" };

  await prisma.shiftGenerationRun.update({
    where: { id: run.id },
    data: { status: "DRAFT", confirmedAt: null },
  });

  revalidatePath("/admin/shifts/auto");
  revalidatePath("/admin/shifts");

  return { ok: true, proposedCount: 0, warningCount: 0 };
}
