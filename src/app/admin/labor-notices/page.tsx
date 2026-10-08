import type { LaborNoticeStatus, LaborNoticeType, Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate, toDateInputValue } from "@/lib/format";
import { addDays } from "@/lib/labor-notice/dates";
import { todayJst } from "@/lib/labor-notice/defaults";

import { STATUS_LABEL, TYPE_LABEL } from "./labels";

export const dynamic = "force-dynamic";

/** 有期契約の終了何日前から「次の通知書」を促すか */
const RENEWAL_NOTICE_DAYS = 30;

type Props = {
  searchParams: Promise<{ status?: string; type?: string }>;
};

/** S-A-30 労働条件通知書 一覧 */
export default async function LaborNoticeListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (Object.keys(STATUS_LABEL) as LaborNoticeStatus[]).find((s) => s === sp.status);
  const type = (Object.keys(TYPE_LABEL) as LaborNoticeType[]).find((t) => t === sp.type);

  const where: Prisma.LaborNoticeWhereInput = {
    ...(status ? { status } : {}),
    ...(type ? { noticeType: type } : {}),
  };
  const [notices, latest] = await Promise.all([
    prisma.laborNotice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        employee: { select: { lastName: true, firstName: true } },
        office: { select: { name: true } },
      },
    }),
    // 従業員ごとの最新の契約開始日 (更新版を作成済みかの判定用)
    prisma.laborNotice.groupBy({
      by: ["employeeId"],
      where: { status: { not: "VOID" } },
      _max: { contractStartOn: true },
    }),
  ]);
  const latestStart = new Map(latest.map((l) => [l.employeeId, l._max.contractStartOn]));

  const today = todayJst();
  const soon = addDays(today, RENEWAL_NOTICE_DAYS);
  const needsNext = (n: (typeof notices)[number]): boolean => {
    if (n.status !== "ISSUED" && n.status !== "SIGNED") return false;
    if (!n.contractEndOn) return false;
    const end = toDateInputValue(n.contractEndOn);
    if (end > soon) return false;
    const newest = latestStart.get(n.employeeId);
    return !newest || newest <= n.contractEndOn;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">労働条件通知書</h1>
          <p className="mt-1 text-sm text-slate-500">
            5つの項目を入れると、通知書2枚と同意書1枚（A4・3枚）を作れます。
          </p>
        </div>
        <Link
          href="/admin/labor-notices/new"
          className="rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新しく作る
        </Link>
      </header>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">状態</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">すべて</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">区分</span>
          <select
            name="type"
            defaultValue={type ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">すべて</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold"
        >
          絞り込む
        </button>
      </form>

      {notices.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          まだ通知書がありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">番号</th>
                <th className="px-3 py-2">従業員</th>
                <th className="px-3 py-2">区分</th>
                <th className="px-3 py-2">勤務先</th>
                <th className="px-3 py-2">契約期間</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const next = needsNext(n);
                const isPartFixed = n.noticeType === "PART_TIME";
                return (
                  <tr
                    key={n.id}
                    className={`border-t border-slate-100 ${next ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono">{n.noticeNo ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/labor-notices/${n.id}`}
                        className="font-semibold hover:underline"
                      >
                        {n.employee.lastName} {n.employee.firstName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{TYPE_LABEL[n.noticeType]}</td>
                    <td className="px-3 py-2">{n.office.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(n.contractStartOn)}〜
                      {n.contractEndOn ? formatDate(n.contractEndOn) : ""}
                      {next && (
                        <span className="ml-2 text-xs font-semibold text-amber-800">
                          まもなく終了
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[n.status]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {next && (
                        <Link
                          href={`/admin/labor-notices/new?from=${n.id}&mode=${isPartFixed ? "indefinite" : "renew"}`}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          {isPartFixed ? "無期の通知書を作成" : "更新版を作成"}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
