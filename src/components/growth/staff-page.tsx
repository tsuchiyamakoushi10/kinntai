/**
 * 職員ごとの画面 (カルテ / 面談記録 / 一次考課 / 最終考課 / 面談確認) の外枠。
 * 権限チェック → 期間の決定 → ヘッダー → 本体。担当外・存在しない職員は 404。
 */
import type { EvaluationPeriod, UserRole } from "@prisma/client";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { checkStaffAccess } from "@/lib/growth/access";
import { listPeriods, resolvePeriod } from "@/lib/growth/queries";

import { StaffHeader, type StaffTab } from "./staff-screens";

export type StaffScreenProps = {
  employeeId: string;
  role: UserRole;
  periods: EvaluationPeriod[];
  period: EvaluationPeriod;
};

export async function StaffPage({
  employeeId,
  periodParam,
  tab,
  presidentOnly,
  render,
}: {
  employeeId: string;
  periodParam: string | undefined;
  tab: StaffTab;
  presidentOnly?: boolean;
  render: (props: StaffScreenProps) => ReactNode;
}) {
  const access = await checkStaffAccess(employeeId);
  if (!access) notFound();
  if (presidentOnly && access.actor.role !== "ADMIN") notFound();
  const periods = await listPeriods();
  const period = resolvePeriod(periods, periodParam);
  if (!period) {
    return (
      <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
        評価期間がまだありません。社長（管理者）が「面談・考課の設定」で期間を作ると使えるようになります。
      </p>
    );
  }
  const props = { employeeId, role: access.actor.role, periods, period };
  return (
    <div className="flex flex-col gap-5">
      <StaffHeader {...props} tab={tab} />
      {render(props)}
    </div>
  );
}
