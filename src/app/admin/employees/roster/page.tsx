import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { EMPLOYMENT_TYPE_OPTIONS, JOB_CATEGORY_OPTIONS } from "@/lib/employee-labels";
import { cellText } from "@/lib/roster/html";
import { loadRoster } from "@/lib/roster/load";
import {
  MAX_BLANK_COLUMNS,
  parseRosterQuery,
  presetSearch,
  ROSTER_COLUMN_LABELS,
  ROSTER_COLUMNS,
  ROSTER_PRESETS,
  rosterQueryToSearch,
  todayJst,
  type RawParams,
} from "@/lib/roster/query";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawParams> };

const boxClass = "rounded-xl border border-slate-200 bg-white p-4";
const legendClass = "mb-2 text-sm font-bold text-slate-800";
const inputClass = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const checkClass =
  "flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm has-[:checked]:border-pink-400 has-[:checked]:bg-pink-50";

/**
 * 名簿作成 (S-A-43)。条件で従業員を抽出し、記入欄つきの名簿を印刷する。
 * フォームは GET で送り、URL を真とする (印刷画面も同じ条件で作る)。
 */
export default async function RosterPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayJst();
  const q = parseRosterQuery(sp, today);
  const { result, offices, conditionText } = await loadRoster(q);
  const printHref = `/admin/employees/roster/print?${rosterQueryToSearch(q)}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/employees" className="text-sm text-slate-500 hover:underline">
            ← 従業員一覧
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">名簿を作る</h1>
          <p className="mt-1 text-sm text-slate-500">
            インフルエンザの予防接種や健康診断などで、条件に合う人の名簿を印刷できます。
          </p>
        </div>
      </header>

      <section className={boxClass}>
        <p className={legendClass}>ひな形から始める</p>
        <div className="flex flex-wrap gap-2">
          {ROSTER_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/employees/roster?${presetSearch(p)}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {p.label}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          押すとタイトル・項目・記入欄が入ります。対象の人は下の条件で絞り込んでください。
        </p>
      </section>

      {/* key: ひな形やリセットで URL だけ変わったとき、入力欄を作り直して新しい値を出す */}
      <form key={rosterQueryToSearch(q)} method="get" className="flex flex-col gap-4">
        <input type="hidden" name="submitted" value="1" />

        <fieldset className={boxClass}>
          <legend className="sr-only">名簿のタイトル</legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className={legendClass}>名簿のタイトル</span>
            <input
              name="title"
              defaultValue={q.title}
              maxLength={60}
              className={`${inputClass} max-w-lg`}
            />
          </label>
        </fieldset>

        <fieldset className={`${boxClass} flex flex-col gap-4`}>
          <legend className="sr-only">名簿に入れる人</legend>
          <p className={legendClass}>名簿に入れる人（何も選ばない項目は「全員」）</p>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">拠点</p>
            <div className="flex flex-wrap gap-2">
              {offices.map((o) => (
                <label key={o.id} className={checkClass}>
                  <input
                    type="checkbox"
                    name="office"
                    value={o.id}
                    defaultChecked={q.officeIds.includes(o.id)}
                  />
                  {o.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">職種</p>
            <div className="flex flex-wrap gap-2">
              {JOB_CATEGORY_OPTIONS.map((o) => (
                <label key={o.value} className={checkClass}>
                  <input
                    type="checkbox"
                    name="job"
                    value={o.value}
                    defaultChecked={q.jobs.includes(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">雇用形態</p>
            <div className="flex flex-wrap gap-2">
              {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                <label key={o.value} className={checkClass}>
                  <input
                    type="checkbox"
                    name="type"
                    value={o.value}
                    defaultChecked={q.types.includes(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">性別</span>
              <select name="gender" defaultValue={q.gender ?? ""} className={inputClass}>
                <option value="">すべて</option>
                <option value="MALE">男性</option>
                <option value="FEMALE">女性</option>
              </select>
            </label>

            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">年齢</span>
              <span className="flex items-center gap-1">
                <input
                  name="ageMin"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={q.ageMin ?? ""}
                  aria-label="何歳以上"
                  className={`${inputClass} w-20`}
                />
                歳以上
                <input
                  name="ageMax"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={q.ageMax ?? ""}
                  aria-label="何歳以下"
                  className={`${inputClass} ml-2 w-20`}
                />
                歳以下
              </span>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">年齢を数える日</span>
              <input name="refDate" type="date" defaultValue={q.refDate} className={inputClass} />
            </label>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            例: 35歳ちょうどの人だけ → 「35歳以上」「35歳以下」の両方に 35 を入れる
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className={checkClass}>
              <input type="checkbox" name="night" value="1" defaultChecked={q.nightOnly} />
              夜勤に入った人だけ
            </label>
            <span className="flex items-center gap-1 text-sm text-slate-600">
              期間
              <input
                name="nightFrom"
                type="date"
                defaultValue={q.nightFrom}
                aria-label="夜勤を見る期間の始め"
                className={inputClass}
              />
              〜
              <input
                name="nightTo"
                type="date"
                defaultValue={q.nightTo}
                aria-label="夜勤を見る期間の終わり"
                className={inputClass}
              />
            </span>
          </div>

          <label className={`${checkClass} w-fit`}>
            <input type="checkbox" name="onLeave" value="1" defaultChecked={q.includeOnLeave} />
            休職中の人も入れる
          </label>
        </fieldset>

        <fieldset className={`${boxClass} flex flex-col gap-4`}>
          <legend className="sr-only">名簿の形</legend>
          <p className={legendClass}>名簿の形</p>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              名前の横に出す項目（No と氏名はいつも出ます）
            </p>
            <div className="flex flex-wrap gap-2">
              {ROSTER_COLUMNS.map((c) => (
                <label key={c} className={checkClass}>
                  <input
                    type="checkbox"
                    name="cols"
                    value={c}
                    defaultChecked={q.columns.includes(c)}
                  />
                  {ROSTER_COLUMN_LABELS[c]}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-slate-600">
              手書きで書き込む欄（「、」で区切って {MAX_BLANK_COLUMNS} つまで）
            </span>
            <input
              name="blanks"
              defaultValue={q.blanks.join("、")}
              placeholder="例: 接種日、サイン"
              className={`${inputClass} max-w-lg`}
            />
          </label>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">並び順</span>
              <select name="sort" defaultValue={q.sort} className={inputClass}>
                <option value="office">拠点ごと → 名前順</option>
                <option value="kana">名前順（あいうえお）</option>
                <option value="code">社員番号順</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">用紙の向き</span>
              <select
                name="orient"
                defaultValue={q.landscape ? "landscape" : "portrait"}
                className={inputClass}
              >
                <option value="portrait">A4 たて</option>
                <option value="landscape">A4 よこ（項目が多いとき）</option>
              </select>
            </label>
            <label className={checkClass}>
              <input
                type="checkbox"
                name="breakByOffice"
                value="1"
                defaultChecked={q.breakByOffice}
              />
              拠点ごとに紙を分ける
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800"
          >
            この条件で名簿を見る
          </button>
          <Link href="/admin/employees/roster" className="text-sm text-slate-600 hover:underline">
            条件をリセット
          </Link>
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {q.title}
              <span className="ml-2 text-base font-medium text-slate-500">
                {result.rows.length} 名
              </span>
            </h2>
            <p className="text-xs text-slate-500">{conditionText}</p>
          </div>
          <a
            href={printHref}
            target="_blank"
            rel="noopener"
            className="rounded-md bg-pink-600 px-6 py-3 text-base font-semibold text-white hover:bg-pink-700"
          >
            印刷する
          </a>
        </div>

        {(result.missingBirth > 0 || result.missingGender > 0) && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {result.missingBirth > 0 &&
              `生年月日が未登録の ${result.missingBirth} 名は年齢で絞れないため外れています。`}
            {result.missingGender > 0 &&
              `性別が未登録の ${result.missingGender} 名は性別で絞れないため外れています。`}
            従業員の編集画面から登録してください。
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">No</th>
                <th className="px-3 py-2 font-medium">氏名</th>
                {q.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    {ROSTER_COLUMN_LABELS[c]}
                  </th>
                ))}
                {q.blanks.map((b, i) => (
                  <th key={i} className="px-3 py-2 font-medium text-slate-400">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((e, i) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap text-slate-900">
                    {e.lastName} {e.firstName}
                  </td>
                  {q.columns.map((c) => (
                    <td key={c} className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {cellText(e, c, q.refDate) || "—"}
                    </td>
                  ))}
                  {q.blanks.map((_, j) => (
                    <td key={j} className="px-3 py-2" />
                  ))}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + q.columns.length + q.blanks.length}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    条件に合う人がいません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
