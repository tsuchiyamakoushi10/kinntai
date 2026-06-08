import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { OFFICE_SHIFT_SETTING_DEFAULTS } from "@/lib/shift/office-setting";
import { EMPTY_COVERAGE_DEMAND, type CoverageDemandValues } from "@/lib/shift/coverage-demand";
import type { DayKind } from "@prisma/client";

import { SettingsForm } from "./settings-form";
import { CoverageDemandForm } from "./coverage-demand-form";

export const dynamic = "force-dynamic";

type SearchParams = { officeId?: string };
type Props = { searchParams: Promise<SearchParams> };

export default async function AdminShiftSettingsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const officeId = sp.officeId ?? "";

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true },
  });

  if (!officeId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">自動作成の設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            拠点ごとに、シフト自動作成で使う「連勤の上限」「夜勤回数の上限（既定）」「パートの年収上限（既定）」を設定します。
          </p>
        </header>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">拠点を選んでください。</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {offices.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/shift-settings?officeId=${o.id}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const [office, setting, demands] = await Promise.all([
    prisma.office.findUnique({ where: { id: officeId }, select: { id: true, name: true } }),
    prisma.officeShiftSetting.findUnique({
      where: { officeId },
      select: {
        maxConsecutiveWorkDays: true,
        defaultMaxNightShiftsPerMonth: true,
        defaultAnnualIncomeCapYen: true,
      },
    }),
    prisma.officeCoverageDemand.findMany({
      where: { officeId },
      select: {
        dayKind: true,
        amRequired: true,
        pmRequired: true,
        counselorAmRequired: true,
        counselorPmRequired: true,
        nightInRequired: true,
        nightOutRequired: true,
      },
    }),
  ]);

  if (!office) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-slate-500">拠点が見つかりませんでした。</p>
      </div>
    );
  }

  // 行が無ければ既定値を初期表示し、保存で初めてこの拠点専用の設定になる。
  const initialValues = setting ?? OFFICE_SHIFT_SETTING_DEFAULTS;

  // 配置基準: 日種ごとに DB 値、無い日種は全0 で初期化。
  const demandByDayKind = new Map(demands.map((d) => [d.dayKind, d] as const));
  const pick = (dk: DayKind): CoverageDemandValues => {
    const d = demandByDayKind.get(dk);
    return d
      ? {
          amRequired: d.amRequired,
          pmRequired: d.pmRequired,
          counselorAmRequired: d.counselorAmRequired,
          counselorPmRequired: d.counselorPmRequired,
          nightInRequired: d.nightInRequired,
          nightOutRequired: d.nightOutRequired,
        }
      : { ...EMPTY_COVERAGE_DEMAND };
  };
  const coverageInitial = {
    WEEKDAY: pick("WEEKDAY"),
    SATURDAY: pick("SATURDAY"),
    SUNDAY_HOLIDAY: pick("SUNDAY_HOLIDAY"),
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">自動作成の設定</h1>
          <p className="mt-1 text-sm text-slate-500">{office.name}</p>
        </div>
        <Link href="/admin/shift-settings" className="text-sm text-slate-600 hover:underline">
          拠点を選び直す
        </Link>
      </header>

      <nav aria-label="拠点切替" className="flex flex-wrap gap-2">
        {offices.map((o) => (
          <Link
            key={o.id}
            href={`/admin/shift-settings?officeId=${o.id}`}
            aria-current={o.id === officeId ? "page" : undefined}
            className={
              o.id === officeId
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            }
          >
            {o.name}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-800">上限・既定値</h2>
        <SettingsForm
          officeId={officeId}
          initialValues={initialValues}
          isUsingDefaults={setting === null}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-800">配置基準 (午前/午後)</h2>
        <CoverageDemandForm officeId={officeId} initial={coverageInitial} />
      </section>
    </div>
  );
}
