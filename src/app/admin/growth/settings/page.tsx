import Link from "next/link";

import { ActionButton, GrowthForm } from "@/components/growth/growth-form";
import { Card, inputClass, primaryButton, secondaryButton } from "@/components/growth/ui";
import { requireAdmin } from "@/lib/auth-guard";
import {
  deletePeriod,
  saveAssignments,
  savePeriod,
  setCurrentPeriod,
  setManagerRole,
} from "@/lib/growth/actions";
import { employeeName, listPeriods } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";
import { formatDate, toDateInputValue } from "@/lib/format";

export const dynamic = "force-dynamic";

/** S-A-46 面談・考課の設定 (評価期間・部署の管理者・担当の割り当て) */
export default async function GrowthSettingsPage() {
  await requireAdmin();
  const [periods, staff] = await Promise.all([
    listPeriods(),
    prisma.employee.findMany({
      where: { employmentStatus: { not: "RETIRED" } },
      orderBy: [{ office: { code: "asc" } }, { lastNameKana: "asc" }, { employeeCode: "asc" }],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        office: { select: { name: true } },
        user: { select: { role: true } },
        growthProfile: { select: { managerEmployeeId: true } },
      },
    }),
  ]);
  const managers = staff.filter((s) => s.user?.role === "MANAGER");
  const candidates = staff.filter((s) => s.user && s.user.role === "EMPLOYEE");
  const assignedCount = new Map<string, number>();
  for (const s of staff) {
    const m = s.growthProfile?.managerEmployeeId;
    if (m) assignedCount.set(m, (assignedCount.get(m) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/admin/growth" className="self-start text-sm text-slate-600 underline">
          ← 面談・人事考課へ
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">面談・考課の設定</h1>
      </header>

      <Card title="① 評価期間">
        <p className="mb-3 text-sm text-slate-600">
          「いまの期間」が職員のホームに出ます。記録がある期間は消せません。
        </p>
        <ul className="flex flex-col gap-2">
          {periods.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 p-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-900">{p.name}</span>
                  <span className="text-sm text-slate-600 tabular-nums">
                    {formatDate(p.startOn)} 〜 {formatDate(p.endOn)}
                  </span>
                  {p.isCurrent && (
                    <span className="rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">
                      いまの期間
                    </span>
                  )}
                  <span className="ml-auto text-xs text-pink-600 underline">直す</span>
                </summary>
                <GrowthForm action={savePeriod} className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="periodId" value={p.id} />
                  <input
                    name="name"
                    defaultValue={p.name}
                    className={inputClass}
                    aria-label="名前"
                  />
                  <input
                    type="date"
                    name="startOn"
                    defaultValue={toDateInputValue(p.startOn)}
                    className={inputClass}
                    aria-label="開始日"
                  />
                  <input
                    type="date"
                    name="endOn"
                    defaultValue={toDateInputValue(p.endOn)}
                    className={inputClass}
                    aria-label="終了日"
                  />
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                    <button type="submit" className={secondaryButton}>
                      直す
                    </button>
                    {!p.isCurrent && (
                      <ActionButton
                        action={setCurrentPeriod.bind(null, p.id)}
                        label="いまの期間にする"
                      />
                    )}
                    <ActionButton
                      action={deletePeriod.bind(null, p.id)}
                      label="この期間を消す"
                      variant="danger"
                      confirm={`「${p.name}」を消します。よろしいですか？`}
                    />
                  </div>
                </GrowthForm>
              </details>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-sm font-bold text-slate-700">期間を追加する</h3>
        <GrowthForm action={savePeriod} className="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            name="name"
            placeholder="例 2026年 下期"
            className={inputClass}
            aria-label="名前"
          />
          <input type="date" name="startOn" className={inputClass} aria-label="開始日" />
          <input type="date" name="endOn" className={inputClass} aria-label="終了日" />
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" name="isCurrent" defaultChecked={periods.length === 0} />
            追加した期間を「いまの期間」にする
          </label>
          <button type="submit" className={`${primaryButton} sm:col-span-3 sm:justify-self-start`}>
            追加する
          </button>
        </GrowthForm>
      </Card>

      <Card title="② 部署の管理者（面談・考課の担当者）">
        <p className="mb-3 text-sm text-slate-600">
          部署の管理者は、自分の画面から担当職員の面談記録・一次考課を付けられます。ログインのある人だけ選べます。
        </p>
        {managers.length === 0 ? (
          <p className="text-sm text-slate-500">まだいません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {managers.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
              >
                <span>
                  <span className="font-semibold">{employeeName(m)}</span>
                  <span className="ml-2 text-sm text-slate-500">{m.office?.name ?? ""}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    担当 {assignedCount.get(m.id) ?? 0} 人
                  </span>
                </span>
                <ActionButton
                  action={setManagerRole.bind(null, m.id, false)}
                  label="職員に戻す"
                  variant="danger"
                  confirm={`${employeeName(m)} さんを職員に戻します。担当の割り当ても外れます。よろしいですか？`}
                />
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-5 text-sm font-bold text-slate-700">部署の管理者を追加する</h3>
        {candidates.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            追加できる人がいません（ログインのある職員がいません）。
          </p>
        ) : (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-pink-700 underline">
              職員の一覧を開く
            </summary>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="text-sm">
                    {employeeName(c)}
                    <span className="ml-1 text-xs text-slate-500">{c.office?.name ?? ""}</span>
                  </span>
                  <ActionButton
                    action={setManagerRole.bind(null, c.id, true)}
                    label="管理者にする"
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="③ 担当の割り当て">
        <p className="mb-3 text-sm text-slate-600">
          職員ごとに、面談・考課をする部署の管理者を選びます。「なし」の職員は社長が直接入力します。
        </p>
        {managers.length === 0 ? (
          <p className="text-sm text-slate-500">先に ② で部署の管理者を追加してください。</p>
        ) : (
          <GrowthForm action={saveAssignments}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">職員</th>
                    <th className="py-1 pr-3">拠点</th>
                    <th className="py-1">担当</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3">{employeeName(s)}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{s.office?.name ?? "—"}</td>
                      <td className="py-1.5">
                        <select
                          name={`manager:${s.id}`}
                          defaultValue={s.growthProfile?.managerEmployeeId ?? ""}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm sm:w-64"
                        >
                          <option value="">なし（社長が直接）</option>
                          {managers
                            .filter((m) => m.id !== s.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {employeeName(m)}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="submit" className={`${primaryButton} self-start`}>
              割り当てを保存する
            </button>
          </GrowthForm>
        )}
      </Card>
    </div>
  );
}
