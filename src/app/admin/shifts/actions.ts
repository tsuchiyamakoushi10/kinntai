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
    const officeId = String(c.officeId ?? "");
    const note = c.note == null ? null : String(c.note);
    if (!UUID.test(employeeId)) return "従業員 ID の形式が不正です。";
    if (!UUID.test(shiftPatternId)) return "シフトパターン ID の形式が不正です。";
    if (!UUID.test(officeId)) return "セルの事業所 ID の形式が不正です。";
    if (!YMD.test(workDate)) return "日付の形式が不正です。";
    if (!workDate.startsWith(`${ym}-`)) return "対象月外の日付が含まれています。";
    const key = `${employeeId}:${workDate}`;
    if (seen.has(key)) return "同じ従業員・日付の重複セルがあります。";
    seen.add(key);
    out.push({ employeeId, workDate, shiftPatternId, officeId, note });
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

  // この拠点を primary (主たる所属) とする在籍者のみ編集対象。応援受入れ (support) 職員の
  // セルはこのグリッドから保存させない (本人の所属拠点の勤務表が正)。
  // 事業所またぎ職員のために、各人が勤務しうる事業所 (primary ∪ support) も取得する。
  const employees = await prisma.employee.findMany({
    where: {
      officeId: input.officeId,
      OR: [{ retiredAt: null }, { retiredAt: { gte: range.start } }],
    },
    select: {
      id: true,
      officeAssignments: { select: { officeId: true } },
    },
  });
  const employeeIds = new Set(employees.map((e) => e.id));
  // 従業員 → 勤務しうる事業所 (primary=この拠点 + support 割当)。セルの officeId 検証に使う。
  const spannedByEmp = new Map<string, Set<string>>();
  const supportOfficeIds = new Set<string>();
  for (const e of employees) {
    const set = new Set<string>([input.officeId]);
    for (const a of e.officeAssignments) {
      set.add(a.officeId);
      if (a.officeId !== input.officeId) supportOfficeIds.add(a.officeId);
    }
    spannedByEmp.set(e.id, set);
  }

  // 不正な employeeId が混ざってないかチェック (UI バグや改竄対策)
  for (const c of cells) {
    if (!employeeIds.has(c.employeeId)) {
      return { ok: false, error: "対象拠点の従業員ではないセルが含まれています。" };
    }
    if (!spannedByEmp.get(c.employeeId)?.has(c.officeId)) {
      return { ok: false, error: "その従業員が勤務できない事業所のセルが含まれています。" };
    }
  }

  // 利用可能なシフトパターン (拠点固有 + 全拠点共通 + またぎ先の固有記号、有効のみ)
  const patterns = await prisma.shiftPattern.findMany({
    where: {
      isActive: true,
      OR: [
        { officeId: input.officeId },
        { officeId: null },
        { officeId: { in: [...supportOfficeIds] } },
      ],
    },
    select: { id: true, officeId: true, paidLeaveUnits: true },
  });
  const patternById = new Map(patterns.map((p) => [p.id, p]));
  const patternUnits = new Map<string, number>(
    patterns.map((p) => [p.id, p.paidLeaveUnits.toNumber()]),
  );

  for (const c of cells) {
    const p = patternById.get(c.shiftPatternId);
    if (!p) {
      return { ok: false, error: "選択不可のシフトパターンが含まれています。" };
    }
    // 事業所固有記号は、そのセルの事業所と一致していなければならない。
    if (p.officeId != null && p.officeId !== c.officeId) {
      return { ok: false, error: "記号とセルの事業所が一致していません。" };
    }
  }

  // baseline: この拠点 primary 職員の当該月の既存 shifts (全拠点分)。
  // 応援先で入れた日 (別 officeId) も含めて読み、外した日が正しく delete に載るようにする。
  // 応援受入れ (別拠点 primary) の人のセルは employeeIds に含まれないので触らない。
  const baselineRows = await prisma.shift.findMany({
    where: {
      employeeId: { in: [...employeeIds] },
      workDate: { gte: range.start, lt: range.end },
    },
    select: { employeeId: true, workDate: true, shiftPatternId: true, note: true, officeId: true },
  });
  const baseline: ShiftCell[] = baselineRows.map((r) => ({
    employeeId: r.employeeId,
    workDate: r.workDate.toISOString().slice(0, 10),
    shiftPatternId: r.shiftPatternId,
    officeId: r.officeId,
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
          // セルの事業所 (応援なら応援先)。またぎ職員が日ごとに事業所を切り替えられる。
          officeId: u.officeId,
          updatedBy: userId,
        },
        create: {
          employeeId: u.employeeId,
          officeId: u.officeId,
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

export type ReorderResult = { ok: true } | { ok: false; error: string };

/**
 * 勤務表の従業員並び順を保存する。並べ替え後の employeeId 配列を受け取り、
 * その順で display_order = index*10 を振る (拠点内の在籍者のみ)。
 * 0 は「未設定 (雇用形態順)」の意味なので 10 始まりにする。
 */
export async function saveEmployeeOrder(input: {
  officeId: string;
  orderedEmployeeIds: string[];
}): Promise<ReorderResult> {
  await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!Array.isArray(input.orderedEmployeeIds) || input.orderedEmployeeIds.length === 0) {
    return { ok: false, error: "並び順の指定が空です。" };
  }
  if (input.orderedEmployeeIds.some((id) => !UUID.test(id))) {
    return { ok: false, error: "従業員 ID の形式が不正です。" };
  }

  // 改竄対策: 指定 ID が当該拠点の従業員かチェック
  const employees = await prisma.employee.findMany({
    where: { officeId: input.officeId, id: { in: input.orderedEmployeeIds } },
    select: { id: true },
  });
  const validIds = new Set(employees.map((e) => e.id));
  if (input.orderedEmployeeIds.some((id) => !validIds.has(id))) {
    return { ok: false, error: "対象拠点の従業員ではない ID が含まれています。" };
  }

  await prisma.$transaction(
    input.orderedEmployeeIds.map((id, index) =>
      prisma.employee.update({ where: { id }, data: { displayOrder: (index + 1) * 10 } }),
    ),
  );

  revalidatePath("/admin/shifts");
  return { ok: true };
}

/** 拠点内の従業員の手動並び順をクリア (display_order=0 → 雇用形態順に復帰)。 */
export async function resetEmployeeOrder(input: { officeId: string }): Promise<ReorderResult> {
  await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };

  await prisma.employee.updateMany({
    where: { officeId: input.officeId },
    data: { displayOrder: 0 },
  });

  revalidatePath("/admin/shifts");
  return { ok: true };
}

export type PublishResult = { ok: true } | { ok: false; error: string };

/**
 * 勤務表の公開 (拠点 × 月)。shift_publications に行を作る = 職員が /me/shifts で
 * その月を閲覧可能になる。unique 制約で冪等 (二重公開しても publishedAt/by を更新)。
 */
export async function publishShifts(input: {
  officeId: string;
  ym: string;
}): Promise<PublishResult> {
  const session = await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };

  const targetMonth = monthRange(input.ym).start;
  await prisma.shiftPublication.upsert({
    where: { officeId_targetMonth: { officeId: input.officeId, targetMonth } },
    create: { officeId: input.officeId, targetMonth, publishedById: session.user.id },
    update: { publishedById: session.user.id, publishedAt: new Date() },
  });

  revalidatePath("/admin/shifts");
  return { ok: true };
}

/**
 * 勤務表の公開取消 (拠点 × 月)。行を消す = 職員から再び隠す。誤公開のリカバリ用。
 * 行が無ければ no-op。シフト本体 (shifts) は触らない。
 */
export async function unpublishShifts(input: {
  officeId: string;
  ym: string;
}): Promise<PublishResult> {
  await requireAdmin();
  if (!UUID.test(input.officeId)) return { ok: false, error: "拠点 ID の形式が不正です。" };
  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };

  const targetMonth = monthRange(input.ym).start;
  await prisma.shiftPublication.deleteMany({
    where: { officeId: input.officeId, targetMonth },
  });

  revalidatePath("/admin/shifts");
  return { ok: true };
}
