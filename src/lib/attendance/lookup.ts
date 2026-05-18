/**
 * 「今この従業員に対して有効な打刻レコード」を取り出すルックアップ。
 *
 * deriveState() に渡すために、page と Server Action の両方から呼ぶ。
 *
 * 解決順:
 *   1. clockOutAt = null（進行中）のうち最新の work_date のもの。
 *      → 夜勤跨ぎで日付が変わってもこれが拾える。
 *   2. 進行中が無ければ、今日 (JST) の完了レコード。
 *      → 同日中に出勤→退勤まで終わっていれば FINISHED 判定に使う。
 *   3. どちらも無ければ null（= NONE 状態）。
 */
import { prisma } from "@/lib/db";

export type RelevantAttendance = Awaited<ReturnType<typeof findRelevantAttendance>>;

export async function findRelevantAttendance(employeeId: string, todayJst: Date) {
  const open = await prisma.attendanceRecord.findFirst({
    where: { employeeId, clockOutAt: null },
    orderBy: { workDate: "desc" },
    include: { breakRecords: { orderBy: { breakStartAt: "asc" } } },
  });
  if (open) return open;

  return prisma.attendanceRecord.findUnique({
    where: { employeeId_workDate: { employeeId, workDate: todayJst } },
    include: { breakRecords: { orderBy: { breakStartAt: "asc" } } },
  });
}
