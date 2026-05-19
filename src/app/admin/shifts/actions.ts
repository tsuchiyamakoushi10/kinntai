"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fromJstYmd, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { computeShiftDiff, planConsumptions, type ShiftCell } from "@/lib/shifts/diff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type SaveShiftsInput = {
  officeId: string;
  ym: string; // YYYY-MM
  /** ユーザーが画面で編集した結果のフルセル一覧。空セルは含めない。 */
  cells: ShiftCell[];
};

export type SaveShiftsResult =
  | { ok: true; upserted: number; deleted: number }
  | { ok: false; error: string };

function validateCells(cells: unknown, ym: string): ShiftCell[] | string {
  if (!Array.isArray(cells)) return "セル一覧の形式が不正です。";
  const out: ShiftCell[] = [];
  const seen = new Set<string>();
  for (const raw of cells) {
    if (typeof raw !== "object" || raw === null) return "セルの形式が不正です。";
    const c = raw as Record<string, unknown>;
    const employeeId = String(c.employeeId ?? "");
    const workDate = String(c.workDate ?? "");
    const shiftPatternId = String(c.shiftPatternId ?? "");
    const note = c.note == null ? null : String(c.note);
    if (!UUID.test(employeeId)) return "従業員 ID の形式が不正です。";
    if (!UUID.test(shiftPatternId)) return "シフトパターン ID の形式が不正です。";
    if (!YMD.test(workDate)) return "日付の形式が不正です。";
    if (!workDate.startsWith(`${ym}-`)) return "対象月外の日付が含まれています。";
    const key = `${employeeId}:${workDate}`;
    if (seen.has(key)) return "同じ従業員・日付の重複セルがあります。";
    seen.add(key);
    out.push({ employeeId, workDate, shiftPatternId, note });
  }
  return out;
}

/**
 * 月次勤務表の差分を一括保存する。
 *
 * - 拠点に紐づく従業員と、月の範囲を基準に baseline を読む
 * - diff (upserts/deletes) を計算し、Prisma transaction で適用
 * - paid_leave_consumptions も同期 (shifts 単位ではなく
 *   (employee_id, consumed_on) 単位で全削除→再作成)
 *
 * 注意:
 *   消化レコードの source_grant_id は本実装では NULL のまま。
 *   有給付与 (Phase 1-F) の実装時に、消化を古い grant から
 *   割り当てるロジックを別途追加する。
 */
export async function saveShifts(input: SaveShiftsInput): Promise<SaveShiftsResult> {
  const session = await requireAdmin();

  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です (YYYY-MM)。" };

  const cells = validateCells(input.cells, input.ym);
  if (typeof cells === "string") return { ok: false, error: cells };

  const range = monthRange(input.ym);

  // この拠点に在籍している (退職していない、または当月内に退職した) 従業員のみ
  const employees = await prisma.employee.findMany({
    where: {
      officeId: input.officeId,
      OR: [{ retiredAt: null }, { retiredAt: { gte: range.start } }],
    },
    select: { id: true },
  });
  const employeeIds = new Set(employees.map((e) => e.id));

  // 不正な employeeId が混ざってないかチェック (UI バグや改竄対策)
  for (const c of cells) {
    if (!employeeIds.has(c.employeeId)) {
      return { ok: false, error: "対象拠点の従業員ではないセルが含まれています。" };
    }
  }

  // 利用可能なシフトパターン (拠点固有 + 全拠点共通、有効のみ)
  const patterns = await prisma.shiftPattern.findMany({
    where: {
      isActive: true,
      OR: [{ officeId: input.officeId }, { officeId: null }],
    },
    select: { id: true, paidLeaveUnits: true },
  });
  const patternIds = new Set(patterns.map((p) => p.id));
  const patternUnits = new Map<string, number>(
    patterns.map((p) => [p.id, p.paidLeaveUnits.toNumber()]),
  );

  for (const c of cells) {
    if (!patternIds.has(c.shiftPatternId)) {
      return { ok: false, error: "選択不可のシフトパターンが含まれています。" };
    }
  }

  // baseline: 当該拠点 × 当該月の既存 shifts
  const baselineRows = await prisma.shift.findMany({
    where: {
      officeId: input.officeId,
      workDate: { gte: range.start, lt: range.end },
    },
    select: { employeeId: true, workDate: true, shiftPatternId: true, note: true },
  });
  const baseline: ShiftCell[] = baselineRows.map((r) => ({
    employeeId: r.employeeId,
    workDate: r.workDate.toISOString().slice(0, 10),
    shiftPatternId: r.shiftPatternId,
    note: r.note,
  }));

  const diff = computeShiftDiff(baseline, cells);
  const plan = planConsumptions(diff, patternUnits);

  const userId = session.user.id;

  await prisma.$transaction(async (tx) => {
    // 1) 消化レコードの残骸削除 (対象 (employee, consumed_on))
    if (plan.consumptionDeletes.length > 0) {
      // OR を組んで一括削除
      await tx.paidLeaveConsumption.deleteMany({
        where: {
          OR: plan.consumptionDeletes.map((d) => ({
            employeeId: d.employeeId,
            consumedOn: fromJstYmd(d.consumedOn),
          })),
        },
      });
    }

    // 2) shifts の削除
    if (diff.deletes.length > 0) {
      await tx.shift.deleteMany({
        where: {
          OR: diff.deletes.map((d) => ({
            employeeId: d.employeeId,
            workDate: fromJstYmd(d.workDate),
          })),
        },
      });
    }

    // 3) shifts の upsert (1 件ずつ。月最大 ~ 1500 件想定で許容範囲)
    for (const u of diff.upserts) {
      await tx.shift.upsert({
        where: {
          employeeId_workDate: {
            employeeId: u.employeeId,
            workDate: fromJstYmd(u.workDate),
          },
        },
        update: {
          shiftPatternId: u.shiftPatternId,
          note: u.note,
          officeId: input.officeId,
          updatedBy: userId,
        },
        create: {
          employeeId: u.employeeId,
          officeId: input.officeId,
          workDate: fromJstYmd(u.workDate),
          shiftPatternId: u.shiftPatternId,
          note: u.note,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    // 4) 消化レコードの新規作成。shiftId は upsert 後に取り直す必要があるため
    //    まとめて検索してから作成する。
    if (plan.consumptionCreates.length > 0) {
      const matchingShifts = await tx.shift.findMany({
        where: {
          OR: plan.consumptionCreates.map((c) => ({
            employeeId: c.employeeId,
            workDate: fromJstYmd(c.consumedOn),
          })),
        },
        select: { id: true, employeeId: true, workDate: true },
      });
      const shiftIdMap = new Map<string, string>();
      for (const s of matchingShifts) {
        const key = `${s.employeeId}:${s.workDate.toISOString().slice(0, 10)}`;
        shiftIdMap.set(key, s.id);
      }
      await tx.paidLeaveConsumption.createMany({
        data: plan.consumptionCreates.map((c) => ({
          employeeId: c.employeeId,
          consumedOn: fromJstYmd(c.consumedOn),
          consumedDays: new Prisma.Decimal(c.consumedDays),
          shiftId: shiftIdMap.get(`${c.employeeId}:${c.consumedOn}`) ?? null,
        })),
      });
    }
  });

  revalidatePath("/admin/shifts");

  return { ok: true, upserted: diff.upserts.length, deleted: diff.deletes.length };
}
