/**
 * 昇給通知の作成画面 (S-A-40) に渡すデータの組み立て (サーバ専用)。
 * 従業員ごとに「今の賃金」を、新しい方から 前回の昇給通知 → 労働条件通知書 → 従業員データ で決める。
 */
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { parseNoticeInput } from "@/lib/labor-notice/parse";
import type { NoticeMasters } from "@/lib/labor-notice/types";
import { rowsFromBase, rowsFromNotice, rowsFromPreviousRaise } from "@/lib/raise-notice/rows";
import type { RaiseRow, RaiseView, RaiseWageKind } from "@/lib/raise-notice/types";

export type RaiseEditorEmployee = {
  id: string;
  name: string;
  officeName: string;
  kind: RaiseWageKind;
  rows: RaiseRow[];
  /** 今の金額をどこから取ったか (画面に出す)。null は賃金データなし */
  source: string | null;
};

const WAGE_TYPE_TO_KIND = { MONTHLY: "MONTHLY", HOURLY: "HOURLY", DAILY: "NIGHT_DAILY" } as const;

export async function loadRaiseEmployees(masters: NoticeMasters): Promise<RaiseEditorEmployee[]> {
  const [employees, notices, raises] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: { not: "RETIRED" } },
      orderBy: { employeeCode: "asc" },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        baseWageType: true,
        baseWageAmount: true,
        office: { select: { name: true } },
      },
    }),
    prisma.laborNotice.findMany({
      where: { status: { in: ["ISSUED", "SIGNED"] } },
      orderBy: { issuedAt: "desc" },
      select: {
        employeeId: true,
        noticeNo: true,
        input: true,
        issuedAt: true,
        office: { select: { name: true } },
      },
    }),
    prisma.raiseNotice.findMany({
      orderBy: { createdAt: "desc" },
      select: { employeeId: true, snapshot: true, createdAt: true, effectiveOn: true },
    }),
  ]);
  const latestNotice = new Map<string, (typeof notices)[number]>();
  for (const n of notices) if (!latestNotice.has(n.employeeId)) latestNotice.set(n.employeeId, n);
  const latestRaise = new Map<string, (typeof raises)[number]>();
  for (const r of raises) if (!latestRaise.has(r.employeeId)) latestRaise.set(r.employeeId, r);

  return employees.map((e) => {
    const name = `${e.lastName} ${e.firstName}`;
    const notice = latestNotice.get(e.id);
    const raise = latestRaise.get(e.id);
    const officeName = notice?.office.name ?? e.office?.name ?? "";
    const input = notice ? parseNoticeInput(notice.input) : null;

    if (raise && (!notice?.issuedAt || raise.createdAt > notice.issuedAt)) {
      const prev = raise.snapshot as unknown as RaiseView;
      return {
        id: e.id,
        name,
        officeName,
        kind: prev.kind,
        rows: rowsFromPreviousRaise(prev.rows, prev.kind, masters.allowanceTypes),
        source: `前回の昇給通知（${formatDate(raise.effectiveOn)}から）`,
      };
    }
    if (notice && input) {
      return {
        id: e.id,
        name,
        officeName,
        kind: input.wage.kind,
        rows: rowsFromNotice(
          input,
          masters.presets[input.employmentType].qualificationAllowances,
          masters.allowanceTypes,
        ),
        source: `労働条件通知書 ${notice.noticeNo ?? ""}`,
      };
    }
    const kind = e.baseWageType ? WAGE_TYPE_TO_KIND[e.baseWageType] : "HOURLY";
    return {
      id: e.id,
      name,
      officeName,
      kind,
      rows: rowsFromBase(kind, e.baseWageAmount ?? 0),
      source: e.baseWageAmount ? "従業員データの基本給" : null,
    };
  });
}
