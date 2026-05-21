import Link from "next/link";

type Props = {
  offices: ReadonlyArray<{ id: string; name: string }>;
  values: { officeId: string; ym: string };
};

/**
 * 勤務表編集の拠点・月セレクタ。officeId は必須 (空のままだと grid を出さない)。
 */
export function ShiftFilters({ offices, values }: Props) {
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
          required
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">選択してください</option>
          <option value="all">全拠点 (閲覧専用)</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">対象月</span>
        <input
          type="month"
          name="ym"
          defaultValue={values.ym}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        表示
      </button>

      {values.officeId && (
        <Link
          href={`/admin/shifts?ym=${values.ym}`}
          className="text-sm text-slate-600 hover:underline"
        >
          拠点を選び直す
        </Link>
      )}
    </form>
  );
}
