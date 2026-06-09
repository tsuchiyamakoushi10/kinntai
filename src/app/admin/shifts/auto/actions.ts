"use server";

import { revalidatePath } from "next/cache";

import { fromJstYmd, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { loadDeyGenerateInput } from "@/lib/shift/dey/data";
import { generateDey } from "@/lib/shift/dey/generate";
import { summarizeDeyCoverage, toDeyProposals } from "@/lib/shift/dey/proposals";
import { loadKitchenGenerateInput } from "@/lib/shift/kitchen/data";
import { generateKitchen } from "@/lib/shift/kitchen/generate";
import { summarizeKitchenCoverage, toKitchenProposals } from "@/lib/shift/kitchen/proposals";
import { isDeyOffice, isKitchenOffice, shortConfigForOffice } from "@/lib/shift/office-generator";
import { loadShortGenerateInput } from "@/lib/shift/short/data";
import { generateShort, type ShortConfig } from "@/lib/shift/short/generate";
import { summarizeShortCoverage, toShortProposals } from "@/lib/shift/short/proposals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 拠点ごとに生成器を切り替え、保存形 (proposedShifts) と stats を返す。 */
type BuiltRun = {
  proposedShifts: ReadonlyArray<{ employeeId: string; workDate: string; shiftPatternId: string }>;
  stats: unknown;
  algorithmVersion: string;
  warningCount: number;
};

type ExistingRunMeta = { id: string; generatedById: string } | null;

/**
 * 拠点ごとに生成器を切り替える。専用生成を持たない拠点 (梨花は専用画面、未対応拠点) は
 * null を返し、呼び出し側で「自動作成 未対応」として扱う。
 */
async function buildRun(
  officeId: string,
  ym: string,
  existingRun: ExistingRunMeta,
): Promise<BuiltRun | null> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { code: true },
  });
  const code = office?.code ?? "";
  if (isDeyOffice(code)) {
    return buildDeyRun(officeId, ym, existingRun);
  }
  const shortConfig = shortConfigForOffice(code);
  if (shortConfig) {
    return buildShortRun(officeId, ym, existingRun, shortConfig);
  }
  if (isKitchenOffice(code)) {
    return buildKitchenRun(officeId, ym, existingRun);
  }
  return null;
}

/**
 * デイ (案A) の生成。generateDey → 記号を shiftPatternId に解決 → 手修正セルを除外。
 * 手修正保護: 既存 shifts のうち「自動配置由来かつ未編集」でないセルは上書きしない。
 */
async function buildDeyRun(
  officeId: string,
  ym: string,
  existingRun: ExistingRunMeta,
): Promise<BuiltRun> {
  const input = await loadDeyGenerateInput(prisma, officeId, ym);
  const result = generateDey(input);
  const summary = summarizeDeyCoverage(result);

  const patterns = await prisma.shiftPattern.findMany({ select: { id: true, name: true } });
  const patternIdByName = new Map(patterns.map((p) => [p.name, p.id]));
  const { proposedShifts } = toDeyProposals(result, patternIdByName);

  const protectedCells = await loadProtectedCells(officeId, ym, existingRun);
  const filtered = proposedShifts.filter(
    (p) => !protectedCells.has(`${p.employeeId}|${p.workDate}`),
  );

  return {
    proposedShifts: filtered,
    stats: {
      algorithm: "dey-v1",
      employees: input.employees.length,
      operatingDays: summary.operatingDays,
      filledDays: summary.filledDays,
      amPmShortfallDays: summary.amPmShortfallDays,
      counselorShortDays: summary.counselorShortDays,
    },
    algorithmVersion: "dey-v1",
    warningCount: summary.amPmShortfallDays.length + summary.counselorShortDays.length,
  };
}

/**
 * ショート (案A + 夜勤先取り) の生成。generateShort → 記号を shiftPatternId に解決 →
 * 手修正セルを除外。手修正保護はデイと同じ仕組み (loadProtectedCells)。
 */
async function buildShortRun(
  officeId: string,
  ym: string,
  existingRun: ExistingRunMeta,
  config: ShortConfig,
): Promise<BuiltRun> {
  const input = await loadShortGenerateInput(prisma, officeId, ym, config);
  const result = generateShort(input);
  const summary = summarizeShortCoverage(result);

  const patterns = await prisma.shiftPattern.findMany({ select: { id: true, name: true } });
  const patternIdByName = new Map(patterns.map((p) => [p.name, p.id]));
  const { proposedShifts } = toShortProposals(result, patternIdByName);

  const protectedCells = await loadProtectedCells(officeId, ym, existingRun);
  const filtered = proposedShifts.filter(
    (p) => !protectedCells.has(`${p.employeeId}|${p.workDate}`),
  );

  return {
    proposedShifts: filtered,
    stats: {
      algorithm: "short-v1",
      employees: input.employees.length,
      operatingDays: summary.operatingDays,
      filledDays: summary.filledDays,
      amPmShortfallDays: summary.amPmShortfallDays,
      counselorShortDays: summary.counselorShortDays,
      unfilledNightDays: summary.unfilledNightDays,
    },
    algorithmVersion: "short-v1",
    warningCount:
      summary.amPmShortfallDays.length +
      summary.counselorShortDays.length +
      summary.unfilledNightDays.length,
  };
}

/**
 * 厨房 (固定ロスター) の生成。generateKitchen → 記号を shiftPatternId に解決 → 手修正セルを除外。
 * 手修正保護はデイ/ショートと同じ仕組み (loadProtectedCells)。
 */
async function buildKitchenRun(
  officeId: string,
  ym: string,
  existingRun: ExistingRunMeta,
): Promise<BuiltRun> {
  const input = await loadKitchenGenerateInput(prisma, officeId, ym);
  const result = generateKitchen(input);
  const summary = summarizeKitchenCoverage(result);

  const patterns = await prisma.shiftPattern.findMany({ select: { id: true, name: true } });
  const patternIdByName = new Map(patterns.map((p) => [p.name, p.id]));
  const { proposedShifts } = toKitchenProposals(result, patternIdByName);

  const protectedCells = await loadProtectedCells(officeId, ym, existingRun);
  const filtered = proposedShifts.filter(
    (p) => !protectedCells.has(`${p.employeeId}|${p.workDate}`),
  );

  return {
    proposedShifts: filtered,
    stats: {
      algorithm: "kitchen-v1",
      employees: input.employees.length,
      operatingDays: summary.operatingDays,
      filledDays: summary.filledDays,
      shortfallDays: summary.shortfallDays,
    },
    algorithmVersion: "kitchen-v1",
    warningCount: summary.shortfallDays.length,
  };
}

/** 当月の手修正済セル (employeeId|YYYY-MM-DD) の集合。自動配置直後で未編集のものは含めない。 */
async function loadProtectedCells(
  officeId: string,
  ym: string,
  existingRun: ExistingRunMeta,
): Promise<Set<string>> {
  const range = monthRange(ym);
  const shifts = await prisma.shift.findMany({
    where: { officeId, workDate: { gte: range.start, lt: range.end } },
    select: { employeeId: true, workDate: true, generationRunId: true, updatedBy: true },
  });
  const protectedCells = new Set<string>();
  for (const s of shifts) {
    const autoUntouched =
      existingRun !== null &&
      s.generationRunId === existingRun.id &&
      s.updatedBy === existingRun.generatedById;
    if (!autoUntouched) {
      protectedCells.add(`${s.employeeId}|${s.workDate.toISOString().slice(0, 10)}`);
    }
  }
  return protectedCells;
}

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

  // 入力データ + dry-run (拠点ごとに生成器を切り替え)
  const result = await buildRun(input.officeId, input.ym, existingRun);
  if (!result) {
    return { ok: false, error: "この拠点は自動作成に対応していません。" };
  }

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
        algorithmVersion: result.algorithmVersion,
        generatedById: userId,
        stats: JSON.parse(JSON.stringify(result.stats)),
      },
      update: {
        status: "DRAFT",
        algorithmVersion: result.algorithmVersion,
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

    // 3) 新規 proposedShifts を一括作成。
    // 手修正セルは buildRun で proposedShifts から除外済み、自動配置の未編集分は
    // 上の deleteMany で削除済みなので、残るのは新規作成のみ。1 件ずつ upsert すると
    // Supabase への往復が数百〜千回になりトランザクションがタイムアウトする (P2028) ため、
    // createMany で 1 往復にまとめる。skipDuplicates は手修正セルとの衝突を上書きしない安全網。
    if (result.proposedShifts.length > 0) {
      await tx.shift.createMany({
        data: result.proposedShifts.map((p) => ({
          employeeId: p.employeeId,
          officeId: input.officeId,
          workDate: fromJstYmd(p.workDate),
          shiftPatternId: p.shiftPatternId,
          generationRunId: run.id,
          createdBy: userId,
          updatedBy: userId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidatePath("/admin/shifts/auto");
  revalidatePath("/admin/shifts");

  return {
    ok: true,
    proposedCount: result.proposedShifts.length,
    warningCount: result.warningCount,
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
