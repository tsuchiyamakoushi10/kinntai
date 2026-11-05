import type { LaborNoticeStatus, LaborNoticeType, Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate, parseDateInputValue, toDateInputValue } from "@/lib/format";
import { addDays } from "@/lib/labor-notice/dates";
import { todayJst } from "@/lib/labor-notice/defaults";

import { ArchiveButton, HideVoidButton } from "./[id]/notice-actions";
import { STATUS_LABEL, TYPE_LABEL } from "./labels";

export const dynamic = "force-dynamic";

/** 有期契約の終了何日前から「次の通知書」を促すか */
const RENEWAL_NOTICE_DAYS = 30;

type Props = {
  searchParams: Promise<{ status?: string; type?: string; folder?: string }>;
};

/** S-A-30 労働条件通知書 一覧 */
export default async function LaborNoticeListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (Object.keys(STATUS_LABEL) as LaborNoticeStatus[]).find((s) => s === sp.status);
  const type = (Object.keys(TYPE_LABEL) as LaborNoticeType[]).find((t) => t === sp.type);
  const done = sp.folder === "done";

  const today = todayJst();
  const soon = addDays(today, RENEWAL_NOTICE_DAYS);

  // 一覧から消した無効な通知書は出さない
  const base: Prisma.LaborNoticeWhereInput = {
    hiddenAt: null,
    ...(status ? { status } : {}),
    ...(type ? { noticeType: type } : {}),
  };
  const where: Prisma.LaborNoticeWhereInput = done
    ? { ...base, archivedAt: { not: null } }
    : {
        ...base,
        OR: [
          { archivedAt: null },
          // 完了フォルダにあっても、契約の終了が近いものは作業中にも出す
          { contractEndOn: { lte: parseDateInputValue(soon) ?? undefined } },
        ],
      };
  const [notices, latest, doneCount] = await Promise.all([
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
    prisma.laborNotice.count({ where: { hiddenAt: null, archivedAt: { not: null } } }),
  ]);
  const latestStart = new Map(latest.map((l) => [l.employeeId, l._max.contractStartOn]));

  const needsNext = (n: (typeof notices)[number]): boolean => {
    if (n.status !== "ISSUED" && n.status !== "SIGNED") return false;
    if (!n.contractEndOn) return false;
    const end = toDateInputValue(n.contractEndOn);
    if (end > soon) return false;
    const newest = latestStart.get(n.employeeId);
    return !newest || newest <= n.contractEndOn;
  };
  const rows = done ? notices : notices.filter((n) => n.archivedAt === null || needsNext(n));
  const tabHref = (folder: "active" | "done") => {
    const q = new URLSearchParams();
    if (folder === "done") q.set("folder", "done");
    if (status) q.set("status", status);
    if (type) q.set("type", type);
    const qs = q.toString();
    return `/admin/labor-notices${qs ? `?${qs}` : ""}`;
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

      <nav aria-label="フォルダ" className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["active", "作業中"],
            ["done", `完了フォルダ（${doneCount}）`],
          ] as const
        ).map(([key, label]) => {
          const current = (key === "done") === done;
          return (
            <Link
              key={key}
              href={tabHref(key)}
              aria-current={current ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-base font-semibold ${
                current
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        {done && <input type="hidden" name="folder" value="done" />}
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

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {done
            ? "完了フォルダは空です。署名済みを登録すると、自動でここへ移ります。"
            : "作業中の通知書はありません。"}
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
              {rows.map((n) => {
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
                    <td className="flex flex-wrap items-center gap-2 px-3 py-2 whitespace-nowrap">
                      {next && (
                        <Link
                          href={`/admin/labor-notices/new?from=${n.id}&mode=${isPartFixed ? "indefinite" : "renew"}`}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          {isPartFixed ? "無期の通知書を作成" : "更新版を作成"}
                        </Link>
                      )}
                      {(n.status === "ISSUED" || n.status === "SIGNED") && (
                        <ArchiveButton noticeId={n.id} archived={n.archivedAt !== null} small />
                      )}
                      {n.status === "VOID" && <HideVoidButton noticeId={n.id} small />}
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
