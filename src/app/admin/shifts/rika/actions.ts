"use server";

/**
 * 梨花シフトの DB 保存 (設計書 §6)。
 *
 * 画面 (rika-grid) のセルは memberId = 氏名 / symbol = ShiftPattern.code という
 * config ベースの値を持つ。これを実 DB の Employee / ShiftPattern / Office に解決して
 * `Shift` テーブルへ保存する。既存の自動作成 (S-A-26) と同じく ShiftGenerationRun で
 * 当月分をまとめ、勤務表 (/admin/shifts) からも見えるようにする。
 *
 * 氏名解決: 本番マスターは氏名を Employee.lastName に丸ごと格納している
 *   (従業員フォームが姓のみ必須のため)。完全一致で引く。応援者 (横野・木下) は
 *   主たる所属が別事業所でも、Shift.officeId は応援勤務のため独立に DAY-RIKKA で持てる
 *   (schema の Shift コメント参照)。DB に存在しない氏名は skip して結果に載せる。
 */
import { revalidatePath } from "next/cache";

import { fromJstYmd, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { RIKA_OFFICE_CODE } from "@/lib/shift/rika/config";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALGORITHM_VERSION = "rika-grid-v1";

/** 画面から受け取る 1 セル (氏名 / 日付 / 勤務記号=ShiftPattern.code)。 */
export type RikaSaveCell = {
  memberId: string;
  date: string;
  symbol: string;
};

export type RikaSaveResult =
  | {
      ok: true;
      saved: number;
      /** 保存できなかった職員と理由 (DB に氏名が無い等)。 */
      skipped: Array<{ memberId: string; reason: string }>;
    }
  | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveRikaShifts(input: {
  ym: string;
  cells: ReadonlyArray<RikaSaveCell>;
}): Promise<RikaSaveResult> {
  const session = await requireAdmin();
  const userId = session.user.id;

  if (!YM.test(input.ym)) return { ok: false, error: "対象月の形式が不正です。" };
  const range = monthRange(input.ym);
  const dateSet = new Set(range.days);

  // 入力セルの健全性チェック。範囲外の日付は弾く。
  const cells = input.cells.filter(
    (c) => DATE.test(c.date) && dateSet.has(c.date) && c.symbol && c.memberId,
  );

  // --- 拠点 / 職員 / 勤務記号 を DB に解決 ---
  const office = await prisma.office.findFirst({
    where: { code: RIKA_OFFICE_CODE },
    select: { id: true },
  });
  if (!office) return { ok: false, error: "拠点 (デイサービス梨花) が見つかりません。" };

  const names = [...new Set(cells.map((c) => c.memberId))];
  const symbols = [...new Set(cells.map((c) => c.symbol))];

  const [employees, patterns] = await Promise.all([
    prisma.employee.findMany({
      where: { lastName: { in: names } },
      select: { id: true, lastName: true },
    }),
    prisma.shiftPattern.findMany({
      where: { code: { in: symbols } },
      select: { id: true, code: true },
    }),
  ]);

  // 同姓同名が複数いる場合は曖昧なので採用しない (skip 理由に出す)。
  const nameCount = new Map<string, number>();
  for (const e of employees) nameCount.set(e.lastName, (nameCount.get(e.lastName) ?? 0) + 1);
  const empByName = new Map<string, string>();
  for (const e of employees) {
    if (nameCount.get(e.lastName) === 1) empByName.set(e.lastName, e.id);
  }
  const patByCode = new Map(patterns.map((p) => [p.code, p.id] as const));

  const skipped: Array<{ memberId: string; reason: string }> = [];
  for (const name of names) {
    if (empByName.has(name)) continue;
    skipped.push({
      memberId: name,
      reason:
        (nameCount.get(name) ?? 0) > 1
          ? "同名の従業員が複数いて特定できません"
          : "従業員マスターに該当氏名がありません",
    });
  }

  // 解決できたセルだけ保存対象にする。
  const resolved = cells
    .map((c) => ({
      employeeId: empByName.get(c.memberId),
      patternId: patByCode.get(c.symbol),
      date: c.date,
    }))
    .filter(
      (r): r is { employeeId: string; patternId: string; date: string } =>
        Boolean(r.employeeId) && Boolean(r.patternId),
    );

  await prisma.$transaction(async (tx) => {
    // 1) 当月の run を upsert (status=DRAFT)。
    const run = await tx.shiftGenerationRun.upsert({
      where: {
        officeId_targetMonth: { officeId: office.id, targetMonth: range.start },
      },
      create: {
        officeId: office.id,
        targetMonth: range.start,
        status: "DRAFT",
        algorithmVersion: ALGORITHM_VERSION,
        generatedById: userId,
        stats: { source: "rika-grid", savedCells: resolved.length },
      },
      update: {
        status: "DRAFT",
        algorithmVersion: ALGORITHM_VERSION,
        generatedById: userId,
        generatedAt: new Date(),
        confirmedAt: null,
        stats: { source: "rika-grid", savedCells: resolved.length },
      },
    });

    // 2) 各セルを upsert (氏名×日付の一意制約に従い update or create)。
    const savedKeys = new Set<string>();
    for (const r of resolved) {
      savedKeys.add(`${r.employeeId}|${r.date}`);
      await tx.shift.upsert({
        where: {
          employeeId_workDate: {
            employeeId: r.employeeId,
            workDate: fromJstYmd(r.date),
          },
        },
        update: {
          shiftPatternId: r.patternId,
          officeId: office.id,
          generationRunId: run.id,
          updatedBy: userId,
        },
        create: {
          employeeId: r.employeeId,
          officeId: office.id,
          workDate: fromJstYmd(r.date),
          shiftPatternId: r.patternId,
          generationRunId: run.id,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    // 3) 当 run 由来で、今回のセルに含まれない当月シフトは削除 (画面から消した分)。
    const existing = await tx.shift.findMany({
      where: {
        officeId: office.id,
        generationRunId: run.id,
        workDate: { gte: range.start, lt: range.end },
      },
      select: { id: true, employeeId: true, workDate: true },
    });
    const staleIds = existing
      .filter((s) => !savedKeys.has(`${s.employeeId}|${s.workDate.toISOString().slice(0, 10)}`))
      .map((s) => s.id);
    if (staleIds.length > 0) {
      await tx.shift.deleteMany({ where: { id: { in: staleIds } } });
    }
  });

  revalidatePath("/admin/shifts/rika");
  revalidatePath("/admin/shifts");

  return { ok: true, saved: resolved.length, skipped };
}
