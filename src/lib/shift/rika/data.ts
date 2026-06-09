/**
 * 梨花自動生成の入力を DB から組み立てる (読み取り)。
 *
 * デイ/ショートと同じ自動作成パイプライン (load… → generate… → to…Proposals → 保存) に
 * 梨花を乗せるためのアダプタ。梨花の「誰が・どんな制約か」は設計書ベースの RIKA_ROSTER を
 * 正とし (2026-06-03 オーナー確認)、氏名で DB の Employee に解決して employeeId を得る。
 * これにより generateRikaShifts の出力セル (memberId=employeeId) がそのまま提案形になる。
 *
 * prisma は引数注入 (アプリは singleton、スクリプト/テストは任意の client を渡せる)。
 */
import type { PrismaClient } from "@prisma/client";

import { monthRange } from "@/lib/attendance/business-date";

import { RIKA_ROSTER } from "./config";
import type { RikaGenMember } from "./generate";

export type RikaGenerateInput = {
  ym: string;
  /** generateRikaShifts に渡すメンバー (id = DB の employeeId)。 */
  members: RikaGenMember[];
  /** employeeId → 希望休の日付 ("YYYY-MM-DD")。 */
  requestOff: Record<string, string[]>;
  /** DB に解決できた職員 (氏名 ↔ employeeId)。 */
  resolved: Array<{ name: string; employeeId: string }>;
  /** DB に解決できなかった職員と理由 (氏名不一致・同名複数)。 */
  skipped: Array<{ name: string; reason: string }>;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 梨花の GenerateInput を組み立てる。
 *
 * - メンバー: RIKA_ROSTER を氏名で Employee.lastName に完全一致解決 (saveRikaShifts と同方式)。
 *   同名複数 / 不一致は skip して理由を残す。
 * - 制約 (配置可能記号 / 相談員 / 目安日数 / 週上限 / 応援): RIKA_ROSTER を正とする。
 * - 希望休: shiftPreference (REQUESTED_OFF, 却下以外) を当月で拾い employeeId 別に集約。
 */
export async function loadRikaGenerateInput(
  prisma: PrismaClient,
  ym: string,
): Promise<RikaGenerateInput> {
  const names = RIKA_ROSTER.map((m) => m.name);
  const range = monthRange(ym);

  const [employeesRaw, prefsRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { lastName: { in: names } },
      select: { id: true, lastName: true },
    }),
    prisma.shiftPreference.findMany({
      where: {
        status: { not: "REJECTED" },
        preferenceType: "REQUESTED_OFF",
        targetDate: { gte: range.start, lt: range.end },
        employee: { lastName: { in: names } },
      },
      select: { employeeId: true, targetDate: true },
    }),
  ]);

  // 同姓同名は特定できないため採用しない (skip 理由に出す)。
  const nameCount = new Map<string, number>();
  for (const e of employeesRaw) nameCount.set(e.lastName, (nameCount.get(e.lastName) ?? 0) + 1);
  const empIdByName = new Map<string, string>();
  for (const e of employeesRaw) {
    if (nameCount.get(e.lastName) === 1) empIdByName.set(e.lastName, e.id);
  }

  const members: RikaGenMember[] = [];
  const resolved: Array<{ name: string; employeeId: string }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const m of RIKA_ROSTER) {
    const employeeId = empIdByName.get(m.name);
    if (!employeeId) {
      skipped.push({
        name: m.name,
        reason:
          (nameCount.get(m.name) ?? 0) > 1
            ? "同名の従業員が複数いて特定できません"
            : "従業員マスターに該当氏名がありません",
      });
      continue;
    }
    resolved.push({ name: m.name, employeeId });
    members.push({
      id: employeeId,
      employmentClass: m.employmentClass,
      isHelper: m.isHelper ?? false,
      isCounselor: m.jobLabel === "生活相談員",
      allowedSymbols: [...m.allowedSymbols],
      targetWorkDays: m.targetWorkDays ?? null,
      maxWorkDaysPerWeek: m.maxWorkDaysPerWeek ?? null,
    });
  }

  // 希望休は解決済みメンバーの分だけ employeeId 別に集約。
  const resolvedIds = new Set(resolved.map((r) => r.employeeId));
  const requestOff: Record<string, string[]> = {};
  for (const p of prefsRaw) {
    if (!resolvedIds.has(p.employeeId)) continue;
    (requestOff[p.employeeId] ??= []).push(ymd(p.targetDate));
  }

  return { ym, members, requestOff, resolved, skipped };
}
