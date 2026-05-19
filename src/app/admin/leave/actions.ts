"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fromJstYmd, todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { addYearsYmd } from "@/lib/leave/schedule";
import { planGrantsForEmployee, type EmployeeContext } from "@/lib/leave/grant-apply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type RunStatutoryGrantResult =
  | { ok: true; createdCount: number; employeesProcessed: number }
  | { ok: false; error: string };

/**
 * 自動付与バッチ (S-A-11 の「自動付与を実行」ボタンから呼ばれる)。
 *
 * 在籍中 (退職日が未来 or なし) の全従業員に対して、今日時点で付与すべき
 * STATUTORY の付与レコードを一括作成する。雇い入れから 6 か月未満の従業員、
 * 既に当該日付の STATUTORY が存在する従業員はスキップする。
 *
 * 想定スケジュール: 日次 cron で叩く。一旦は管理画面からの手動実行のみ。
 */
export async function runStatutoryGrant(): Promise<RunStatutoryGrantResult> {
  await requireAdmin();
  const asOf = todayJstYmd();

  const employees = await prisma.employee.findMany({
    where: {
      OR: [{ retiredAt: null }, { retiredAt: { gte: fromJstYmd(asOf) } }],
    },
    select: {
      id: true,
      hiredAt: true,
      retiredAt: true,
      weeklyWorkDays: true,
      dailyWorkHours: true,
      paidLeaveGrants: {
        where: { grantType: "STATUTORY" },
        select: { grantedOn: true },
      },
    },
  });

  const planned: Array<{
    employeeId: string;
    grantedOn: string;
    expiresOn: string;
    grantedDays: number;
  }> = [];

  for (const emp of employees) {
    const weeklyDays = emp.weeklyWorkDays.toNumber();
    const dailyHours = emp.dailyWorkHours.toNumber();
    const ctx: EmployeeContext = {
      id: emp.id,
      hiredOn: toJstYmd(emp.hiredAt),
      retiredOn: emp.retiredAt ? toJstYmd(emp.retiredAt) : null,
      weeklyWorkDays: weeklyDays,
      weeklyWorkHours: weeklyDays * dailyHours,
    };
    const existing = emp.paidLeaveGrants.map((g) => toJstYmd(g.grantedOn));
    const plans = planGrantsForEmployee(ctx, asOf, existing);
    for (const p of plans) {
      planned.push({
        employeeId: p.employeeId,
        grantedOn: p.grantedOn,
        expiresOn: p.expiresOn,
        grantedDays: p.grantedDays,
      });
    }
  }

  if (planned.length === 0) {
    return { ok: true, createdCount: 0, employeesProcessed: employees.length };
  }

  await prisma.paidLeaveGrant.createMany({
    data: planned.map((p) => ({
      employeeId: p.employeeId,
      grantedOn: fromJstYmd(p.grantedOn),
      expiresOn: fromJstYmd(p.expiresOn),
      grantedDays: new Prisma.Decimal(p.grantedDays),
      grantType: "STATUTORY" as const,
    })),
  });

  revalidatePath("/admin/leave");

  return {
    ok: true,
    createdCount: planned.length,
    employeesProcessed: employees.length,
  };
}

export type ManualGrantInput = {
  employeeId: string;
  grantedOn: string;
  grantedDays: number;
  note?: string;
};

export type ManualGrantResult = { ok: true; grantId: string } | { ok: false; error: string };

/**
 * 管理者による手動付与。
 * grant_type = MANUAL_ADJUSTMENT で、expires_on は労基準拠の 2 年とする。
 * 入社時の繰越などは CARRY_OVER で別途専用 Action を切る予定。
 */
export async function grantManual(input: ManualGrantInput): Promise<ManualGrantResult> {
  await requireAdmin();

  if (!UUID.test(input.employeeId)) return { ok: false, error: "従業員 ID が不正です。" };
  if (!YMD.test(input.grantedOn)) return { ok: false, error: "付与日の形式が不正です。" };
  if (!Number.isFinite(input.grantedDays) || input.grantedDays <= 0 || input.grantedDays > 40) {
    return { ok: false, error: "付与日数は 0 を超え 40 以下で指定してください。" };
  }

  const emp = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!emp) return { ok: false, error: "従業員が見つかりませんでした。" };

  const grant = await prisma.paidLeaveGrant.create({
    data: {
      employeeId: input.employeeId,
      grantedOn: fromJstYmd(input.grantedOn),
      expiresOn: fromJstYmd(addYearsYmd(input.grantedOn, 2)),
      grantedDays: new Prisma.Decimal(input.grantedDays),
      grantType: "MANUAL_ADJUSTMENT",
      note: input.note?.trim() || null,
    },
    select: { id: true },
  });

  revalidatePath("/admin/leave");
  revalidatePath(`/admin/leave/${input.employeeId}`);

  return { ok: true, grantId: grant.id };
}
