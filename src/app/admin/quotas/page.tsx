import { ShiftKind } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { QuotaMatrix, type PatternRow, type QuotaValue } from "./quota-matrix";

export const dynamic = "force-dynamic";

type SearchParams = { officeId?: string };
type Props = { searchParams: Promise<SearchParams> };

// quota 編集対象は「勤務系」のみ。休み系 (off / paid_leave / absence / requested_off) は
// 必要人員数を持たないため UI から除外する (docs/auto-shift-design.md §3.1)。
const WORK_SHIFT_KINDS: ShiftKind[] = [ShiftKind.WORK, ShiftKind.NIGHT_IN, ShiftKind.NIGHT_OUT];

export default async function AdminQuotasPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const officeId = sp.officeId ?? "";

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });

  if (!officeId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">シフト枠 設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            拠点ごとに「平日 / 土 / 日祝」の必要人員数を設定します。自動作成 (S-A-26)
            はこの数値を満たすように配置します。
          </p>
        </header>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">拠点を選んでください。</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {offices.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/quotas?officeId=${o.id}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const [office, patterns, quotas] = await Promise.all([
    prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true, name: true },
    }),
    prisma.shiftPattern.findMany({
      where: {
        isActive: true,
        shiftKind: { in: WORK_SHIFT_KINDS },
        OR: [{ officeId }, { officeId: null }],
      },
      orderBy: [{ officeId: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        shiftKind: true,
        color: true,
        officeId: true,
      },
    }),
    prisma.officeShiftQuota.findMany({
      where: { officeId },
      select: {
        shiftPatternId: true,
        dayKind: true,
        requiredCount: true,
      },
    }),
  ]);

  if (!office) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-slate-500">拠点が見つかりませんでした。</p>
      </div>
    );
  }

  const patternRows: PatternRow[] = patterns.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    shiftKind: p.shiftKind,
    color: p.color,
    isShared: p.officeId === null,
  }));

  const initialQuotas: QuotaValue[] = quotas.map((q) => ({
    shiftPatternId: q.shiftPatternId,
    dayKind: q.dayKind,
    requiredCount: q.requiredCount,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">シフト枠 設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            {office.name}・勤務系パターン {patternRows.length} 件
          </p>
        </div>
        <Link href="/admin/quotas" className="text-sm text-slate-600 hover:underline">
          拠点を選び直す
        </Link>
      </header>

      <nav aria-label="拠点切替" className="flex flex-wrap gap-2">
        {offices.map((o) => (
          <Link
            key={o.id}
            href={`/admin/quotas?officeId=${o.id}`}
            aria-current={o.id === officeId ? "page" : undefined}
            className={
              o.id === officeId
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            }
          >
            {o.name}
          </Link>
        ))}
      </nav>

      {patternRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          この拠点で使える勤務系パターンが定義されていません。シフトパターン管理から追加してください。
        </div>
      ) : (
        <QuotaMatrix officeId={officeId} patterns={patternRows} initialQuotas={initialQuotas} />
      )}
    </div>
  );
}
