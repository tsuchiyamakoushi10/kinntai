/**
 * S-A-25 管理者シフト希望管理。
 *
 * 月別 + 拠点フィルタ + 状態フィルタで一覧表示し、accept / reject で承認。
 * 自動シフト生成 (Phase 1-H) からは「ACCEPTED」「PENDING (管理者が暗黙承認運用)」を考慮する想定。
 */
import Link from "next/link";

import { ShiftPreferenceStatus } from "@prisma/client";

import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  SHIFT_PREFERENCE_STATUS_LABELS,
  SHIFT_PREFERENCE_TYPE_LABELS,
} from "@/lib/employee-labels";
import { formatDate, toDateInputValue } from "@/lib/format";

import {
  acceptShiftPreference,
  bulkSetMonthlyOffPreferences,
  createShiftPreferenceByAdmin,
  deleteShiftPreference,
  rejectShiftPreference,
  resetShiftPreference,
} from "./actions";
import { BulkOffCalendar } from "./bulk-off-calendar";
import { ProxyPreferenceForm } from "./proxy-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    ym?: string;
    officeId?: string;
    status?: string;
    bulkEmployeeId?: string;
  }>;
};

export default async function AdminShiftPreferencesPage({ searchParams }: Props) {
  await requireAdmin();
  const { ym: ymRaw, officeId, status: statusRaw, bulkEmployeeId } = await searchParams;
  const ym = isValidYm(ymRaw) ? ymRaw : currentJstYm();
  const month = monthRange(ym);
  const status = isValidStatus(statusRaw) ? statusRaw : "ALL";

  const [offices, employees, preferences] = await Promise.all([
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.employee.findMany({
      where: {
        retiredAt: null,
        ...(officeId ? { officeId } : {}),
      },
      orderBy: [{ office: { code: "asc" } }, { employeeCode: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        lastName: true,
        firstName: true,
        office: { select: { name: true } },
      },
    }),
    prisma.shiftPreference.findMany({
      where: {
        targetDate: { gte: month.start, lt: month.end },
        ...(officeId ? { employee: { officeId } } : {}),
        ...(status === "ALL" ? {} : { status: status as ShiftPreferenceStatus }),
      },
      orderBy: [{ targetDate: "asc" }, { employee: { employeeCode: "asc" } }],
      include: {
        employee: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            employeeCode: true,
            office: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const counts = {
    pending: preferences.filter((p) => p.status === "PENDING").length,
    accepted: preferences.filter((p) => p.status === "ACCEPTED").length,
    rejected: preferences.filter((p) => p.status === "REJECTED").length,
  };

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    name: `${e.lastName} ${e.firstName}`,
    officeName: e.office?.name ?? "—",
  }));

  // 月絞り込みと連動した既定の対象日 (当月の 1 日)。
  const defaultTargetDate = `${ym}-01`;

  // 月初の曜日 (JST 0=日 .. 6=土)。fromJstYmd は UTC 0 時に揃えるので
  // 月初の getUTCDay がそのまま JST 曜日になる。
  const firstWeekday = month.start.getUTCDay();

  // 一括カレンダー対象社員と、その月の既存希望休を取得
  const bulkEmployee = bulkEmployeeId
    ? (employeeOptions.find((e) => e.id === bulkEmployeeId) ?? null)
    : null;
  const bulkExistingOffDays = bulkEmployee
    ? (
        await prisma.shiftPreference.findMany({
          where: {
            employeeId: bulkEmployee.id,
            preferenceType: "REQUESTED_OFF",
            targetDate: { gte: month.start, lt: month.end },
          },
          select: { targetDate: true },
        })
      ).map((p) => toDateInputValue(p.targetDate))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">シフト希望</h1>
          <p className="text-sm text-slate-500">
            従業員から提出された希望休 / 希望夜勤 / 勤務不可の一覧と承認
          </p>
        </div>
      </header>

      <form className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">対象月</span>
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">拠点</span>
          <select
            name="officeId"
            defaultValue={officeId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">すべての拠点</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">状態</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="ALL">すべて</option>
            <option value="PENDING">承認待ち</option>
            <option value="ACCEPTED">承認済</option>
            <option value="REJECTED">却下</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            絞り込み
          </button>
        </div>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="承認待ち" value={counts.pending} tone="warning" />
        <SummaryCard label="承認済" value={counts.accepted} tone="ok" />
        <SummaryCard label="却下" value={counts.rejected} tone="muted" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-800">
          希望休カレンダー入力（社員 1 人ずつ）
        </h2>
        <p className="text-xs text-slate-500">
          紙で集めた希望休をカレンダー上でまとめてチェック → 保存。1 人ぶんずつ繰り返します。
        </p>
        <form
          method="get"
          className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
        >
          <input type="hidden" name="ym" value={ym} />
          <input type="hidden" name="officeId" value={officeId ?? ""} />
          <input type="hidden" name="status" value={status} />
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">対象社員</span>
            <select
              name="bulkEmployeeId"
              defaultValue={bulkEmployee?.id ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">選択してください</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{e.officeName}）
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            カレンダーを開く
          </button>
        </form>

        {bulkEmployee ? (
          <BulkOffCalendar
            action={bulkSetMonthlyOffPreferences}
            employeeId={bulkEmployee.id}
            employeeName={bulkEmployee.name}
            ym={ym}
            days={month.days}
            firstWeekday={firstWeekday}
            initialSelected={bulkExistingOffDays}
          />
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-800">単発の代理入力</h2>
        <p className="text-xs text-slate-500">
          1 件だけ追加したい場合はここから。種別で「希望休 / 希望夜勤 / 勤務不可」を選べます。
          複数日まとめて入れる時は上のカレンダー入力が便利です。
        </p>
        <ProxyPreferenceForm
          action={createShiftPreferenceByAdmin}
          employees={employeeOptions}
          defaultDate={defaultTargetDate}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {preferences.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">該当する希望はありません。</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">対象日</th>
                <th className="px-4 py-3 font-medium">従業員</th>
                <th className="px-4 py-3 font-medium">拠点</th>
                <th className="px-4 py-3 font-medium">種別</th>
                <th className="px-4 py-3 font-medium">メモ</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preferences.map((p) => (
                <tr key={p.id} className="text-slate-700">
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.targetDate)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/employees/${p.employee.id}?tab=constraints`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {p.employee.lastName} {p.employee.firstName}
                    </Link>
                    <div className="text-xs text-slate-500">{p.employee.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{p.employee.office?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {SHIFT_PREFERENCE_TYPE_LABELS[p.preferenceType]}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.note ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.status !== "ACCEPTED" && (
                        <form action={acceptShiftPreference.bind(null, p.id)}>
                          <button
                            type="submit"
                            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            承認
                          </button>
                        </form>
                      )}
                      {p.status !== "REJECTED" && (
                        <form action={rejectShiftPreference.bind(null, p.id)}>
                          <button
                            type="submit"
                            className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            却下
                          </button>
                        </form>
                      )}
                      {p.status !== "PENDING" && (
                        <form action={resetShiftPreference.bind(null, p.id)}>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            戻す
                          </button>
                        </form>
                      )}
                      <form action={deleteShiftPreference.bind(null, p.id)}>
                        <button
                          type="submit"
                          aria-label="削除"
                          className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          削除
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function isValidYm(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s);
}

function isValidStatus(s: string | undefined): s is "ALL" | ShiftPreferenceStatus {
  return s === "ALL" || s === "PENDING" || s === "ACCEPTED" || s === "REJECTED";
}

function StatusBadge({ status }: { status: ShiftPreferenceStatus }) {
  const label = SHIFT_PREFERENCE_STATUS_LABELS[status];
  const tone =
    status === "ACCEPTED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "ok" | "muted";
}) {
  const palette = {
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    muted: "border-slate-200 bg-white text-slate-700",
  } as const;
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${palette[tone]}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
