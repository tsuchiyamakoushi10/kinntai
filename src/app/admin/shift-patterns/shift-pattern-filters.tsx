import Link from "next/link";

export type ShiftPatternFilterValues = {
  /** "all" = 拠点フィルタ無し、"" = 全拠点共通、それ以外 = office.id */
  officeId: string;
  status: "active" | "inactive" | "all";
};

type Props = {
  offices: ReadonlyArray<{ id: string; name: string }>;
  values: ShiftPatternFilterValues;
};

export function ShiftPatternFilters({ offices, values }: Props) {
  const isFiltered = values.officeId !== "all" || values.status !== "active";

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="flex min-w-44 flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">拠点</span>
        <select
          name="officeId"
          defaultValue={values.officeId}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="all">すべて</option>
          <option value="">全拠点共通のみ</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">状態</span>
        <select
          name="status"
          defaultValue={values.status}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="active">有効</option>
          <option value="inactive">停止中</option>
          <option value="all">すべて</option>
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        絞り込む
      </button>

      {isFiltered && (
        <Link href="/admin/shift-patterns" className="text-sm text-slate-600 hover:underline">
          条件をリセット
        </Link>
      )}
    </form>
  );
}
