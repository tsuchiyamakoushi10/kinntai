import { Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { SHIFT_KIND_LABELS } from "@/lib/shift-labels";

import { PatternReorderPanel } from "./pattern-reorder-panel";
import { ShiftPatternFilters, type ShiftPatternFilterValues } from "./shift-pattern-filters";

export const dynamic = "force-dynamic";

type SearchParams = { officeId?: string; status?: string };
type Props = { searchParams: Promise<SearchParams> };

const HM = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatTime(d: Date | null): string {
  if (!d) return "—";
  return HM.format(d);
}

function normalizeStatus(raw: string | undefined): ShiftPatternFilterValues["status"] {
  return raw === "inactive" || raw === "all" ? raw : "active";
}

export default async function ShiftPatternListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const filters: ShiftPatternFilterValues = {
    // "" = 全拠点共通、"all" = フィルタ無し
    officeId: sp.officeId ?? "all",
    status: normalizeStatus(sp.status),
  };

  const where: Prisma.ShiftPatternWhereInput = {};
  if (filters.officeId === "") where.officeId = null;
  else if (filters.officeId !== "all") where.officeId = filters.officeId;
  if (filters.status === "active") where.isActive = true;
  else if (filters.status === "inactive") where.isActive = false;

  const [patterns, offices] = await Promise.all([
    prisma.shiftPattern.findMany({
      where,
      include: { office: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">シフトパターン</h1>
          <p className="mt-1 text-sm text-slate-500">{patterns.length} 件表示中</p>
        </div>
        <Link
          href="/admin/shift-patterns/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新規追加
        </Link>
      </header>

      <ShiftPatternFilters offices={offices} values={filters} />

      <PatternReorderPanel
        patterns={patterns.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          color: p.color,
          officeName: p.office?.name ?? "全拠点共通",
        }))}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3 font-medium">名称</th>
              <th className="px-3 py-3 font-medium">コード</th>
              <th className="px-3 py-3 font-medium">拠点</th>
              <th className="px-3 py-3 font-medium">種別</th>
              <th className="px-3 py-3 font-medium">時間帯</th>
              <th className="px-3 py-3 text-right font-medium">休憩</th>
              <th className="px-3 py-3 font-medium">状態</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patterns.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "bg-slate-50/60 text-slate-500"}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-medium text-slate-900">{p.name}</span>
                    {p.crossesMidnight && (
                      <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                        跨日
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.code}</td>
                <td className="px-3 py-2 text-slate-700">{p.office?.name ?? "全拠点共通"}</td>
                <td className="px-3 py-2 text-slate-700">{SHIFT_KIND_LABELS[p.shiftKind]}</td>
                <td className="px-3 py-2 text-slate-700 tabular-nums">
                  {p.startTime && p.endTime
                    ? `${formatTime(p.startTime)} - ${formatTime(p.endTime)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                  {p.breakMinutes > 0 ? `${p.breakMinutes} 分` : "—"}
                </td>
                <td className="px-3 py-2">
                  {p.isActive ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      有効
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      停止中
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/shift-patterns/${p.id}/edit`}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
            {patterns.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  該当するシフトパターンがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
