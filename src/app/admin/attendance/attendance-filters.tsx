import Link from "next/link";

export type AttendanceFilterValues = {
  ym: string;
  officeId: string;
};

type Props = {
  offices: ReadonlyArray<{ id: string; code: string; name: string }>;
  values: AttendanceFilterValues;
};

/**
 * 月別レビュー一覧の絞り込み。GET でサーバーに飛ばし URL を真とする。
 * 月切替の前月 / 翌月リンクは別 (page 側のヘッダ) で提供する。
 */
export function AttendanceFilters({ offices, values }: Props) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">対象月</span>
        <input
          type="month"
          name="ym"
          defaultValue={values.ym}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="flex min-w-44 flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">拠点</span>
        <select
          name="officeId"
          defaultValue={values.officeId}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">すべて</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        表示
      </button>

      {values.officeId && (
        <Link
          href={`/admin/attendance?ym=${values.ym}`}
          className="text-sm text-slate-600 hover:underline"
        >
          拠点フィルタを外す
        </Link>
      )}
    </form>
  );
}
