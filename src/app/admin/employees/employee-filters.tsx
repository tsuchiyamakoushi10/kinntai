import Link from "next/link";

export type EmployeeFilterValues = {
  officeId: string;
  status: "active" | "on_leave" | "retired" | "all";
  q: string;
};

type Props = {
  offices: ReadonlyArray<{ id: string; code: string; name: string }>;
  values: EmployeeFilterValues;
};

/**
 * 一覧の絞り込み。フォームを GET でサーバーに送り、URL のクエリパラメータ
 * を真とする。クライアント JS なしで動く。
 */
export function EmployeeFilters({ offices, values }: Props) {
  const isFiltered = values.officeId !== "" || values.status !== "active" || values.q !== "";

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
          <option value="">すべて</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">在籍状況</span>
        <select
          name="status"
          defaultValue={values.status}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="active">在籍中</option>
          <option value="on_leave">休職中</option>
          <option value="retired">退職済</option>
          <option value="all">すべて</option>
        </select>
      </label>

      <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">氏名・フリガナ検索</span>
        <input
          name="q"
          defaultValue={values.q}
          placeholder="例: 山田 / ヤマダ"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        絞り込む
      </button>

      {isFiltered && (
        <Link href="/admin/employees" className="text-sm text-slate-600 hover:underline">
          条件をリセット
        </Link>
      )}
    </form>
  );
}
