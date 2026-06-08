import type { ReactNode } from "react";
import Link from "next/link";

import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { generateMonthlyShifts } from "@/lib/shift/auto-generator";
import { loadDeyGenerateInput } from "@/lib/shift/dey/data";
import { generateDey } from "@/lib/shift/dey/generate";
import { summarizeDeyCoverage } from "@/lib/shift/dey/proposals";

import { AutoRunner } from "./auto-runner";
import { DeyPreview } from "./dey-preview";
import { loadGenerateInput } from "./data";

export const dynamic = "force-dynamic";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALGORITHM_VERSION = "phase-v2";
/** 案A の午前/午後モデルで生成する拠点コード。 */
const DEY_OFFICE_CODE = "DAY-CENTER";

type SearchParams = { officeId?: string; ym?: string; seed?: string };
type Props = { searchParams: Promise<SearchParams> };

function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export default async function AdminShiftsAutoPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const ym = sp.ym && YM_PATTERN.test(sp.ym) ? sp.ym : currentJstYm();
  const officeId = sp.officeId ?? "";
  const seed = sp.seed ? Number.parseInt(sp.seed, 10) : Date.now() % 0xffffffff;

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true },
  });

  if (!officeId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">月次シフト自動作成</h1>
          <p className="mt-1 text-sm text-slate-500">
            拠点と対象月を選ぶと、配置案 (dry-run) を計算します。下書き保存・確定の前に
            必ず警告を確認してください。
          </p>
        </header>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">拠点を選んでください。</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {offices.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/shifts/auto?officeId=${o.id}&ym=${ym}`}
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

  const range = monthRange(ym);
  const [office, existingRun] = await Promise.all([
    prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true, name: true, code: true },
    }),
    prisma.shiftGenerationRun.findUnique({
      where: { officeId_targetMonth: { officeId, targetMonth: range.start } },
      select: {
        id: true,
        status: true,
        algorithmVersion: true,
        generatedAt: true,
        confirmedAt: true,
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

  // dry-run を実行 (DB 書き込みなし)。拠点ごとにプレビューを切り替える。
  let employeeCount = 0;
  let proposedCount = 0;
  let preview: ReactNode;

  if (office.code === DEY_OFFICE_CODE) {
    const input = await loadDeyGenerateInput(prisma, officeId, ym);
    const result = generateDey(input);
    const summary = summarizeDeyCoverage(result);
    employeeCount = input.employees.length;
    proposedCount = result.assignments.length;
    preview = <DeyPreview days={result.days} summary={summary} />;
  } else {
    const input = await loadGenerateInput(officeId, ym, seed, ALGORITHM_VERSION);
    const result = generateMonthlyShifts(input);
    employeeCount = input.employees.length;
    proposedCount = result.proposedShifts.length;

    const warnCounts = new Map<string, number>();
    for (const w of result.warnings) {
      warnCounts.set(w.code, (warnCounts.get(w.code) ?? 0) + 1);
    }
    preview = (
      <>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">配置サマリ (dry-run)</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">必要枠</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {result.stats.fill.totalSlots}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">埋まった枠</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {result.stats.fill.filledSlots}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">充足率</dt>
              <dd className="text-lg font-semibold text-slate-900">
                {Math.round(result.stats.fill.rate * 1000) / 10}%
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">処理時間</dt>
              <dd className="text-lg font-semibold text-slate-900">{result.stats.elapsedMs}ms</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">
            警告 ({result.warnings.length})
          </h2>
          {result.warnings.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">警告はありません。</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {Array.from(warnCounts.entries()).map(([code, count]) => (
                <li
                  key={code}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <span className="font-medium text-slate-900">{WARNING_LABELS[code] ?? code}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {count} 件
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">月次シフト自動作成</h1>
          <p className="mt-1 text-sm text-slate-500">
            {office.name}・{formatYm(ym)}・{employeeCount} 名
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/shifts/auto?officeId=${officeId}&ym=${range.prevYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="前の月"
          >
            ←
          </Link>
          <span className="min-w-24 text-center text-base font-bold text-slate-900">
            {formatYm(ym)}
          </span>
          <Link
            href={`/admin/shifts/auto?officeId=${officeId}&ym=${range.nextYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="次の月"
          >
            →
          </Link>
        </div>
      </header>

      <nav aria-label="拠点切替" className="flex flex-wrap gap-2">
        {offices.map((o) => (
          <Link
            key={o.id}
            href={`/admin/shifts/auto?officeId=${o.id}&ym=${ym}`}
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

      {existingRun && (
        <div
          className={
            existingRun.status === "CONFIRMED"
              ? "rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          }
          role="status"
        >
          {existingRun.status === "CONFIRMED" ? (
            <span>
              この月のシフトは <strong>確定済</strong> です (
              {existingRun.confirmedAt?.toISOString().slice(0, 16).replace("T", " ")} 更新)。
              再生成するには確定取り消しが必要です。
            </span>
          ) : (
            <span>
              この月には <strong>下書き保存済</strong> の自動作成結果があります。
              「下書き保存」を押すと上書きされます。
            </span>
          )}
        </div>
      )}

      {preview}

      <AutoRunner
        officeId={officeId}
        ym={ym}
        seed={seed}
        existingRunStatus={existingRun?.status ?? null}
        proposedCount={proposedCount}
      />
    </div>
  );
}

const WARNING_LABELS: Record<string, string> = {
  QUOTA_UNDERFILLED: "必要人員に達していない枠",
  QUOTA_OVERFILLED: "必要人員を超えている枠 (保護対象が多い)",
  NIGHT_SHIFT_OVER_LIMIT: "夜勤上限を超えている従業員",
  NIGHT_PREF_UNMET: "夜勤希望回数に達していない従業員",
  TARGET_WORKDAYS_UNREACHED: "月間出勤目標に達していない従業員",
  INCOME_CAP_EXCEEDED: "年収上限を超える見込みのパート",
  UNAVAILABLE_DOW_VIOLATED: "不可曜日に既存シフトが乗っている",
  PREV_MONTH_NIGHT_HANGING: "前月末 NIGHT_IN を引き継げない",
  INACTIVE_PATTERN_REFERENCED: "無効化パターンを枠が参照している",
};
