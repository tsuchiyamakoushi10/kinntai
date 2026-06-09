import type { ReactNode } from "react";
import Link from "next/link";

import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { loadDeyGenerateInput } from "@/lib/shift/dey/data";
import { generateDey } from "@/lib/shift/dey/generate";
import { summarizeDeyCoverage } from "@/lib/shift/dey/proposals";
import { loadKitchenGenerateInput } from "@/lib/shift/kitchen/data";
import { generateKitchen } from "@/lib/shift/kitchen/generate";
import { summarizeKitchenCoverage } from "@/lib/shift/kitchen/proposals";
import {
  isDeyOffice,
  isKitchenOffice,
  isRikaOffice,
  shortConfigForOffice,
} from "@/lib/shift/office-generator";
import { loadRikaGenerateInput } from "@/lib/shift/rika/data";
import { generateRikaShifts } from "@/lib/shift/rika/generate";
import { summarizeRikaCoverage } from "@/lib/shift/rika/proposals";
import { loadShortGenerateInput } from "@/lib/shift/short/data";
import { generateShort } from "@/lib/shift/short/generate";
import { summarizeShortCoverage } from "@/lib/shift/short/proposals";

import { AutoRunner } from "./auto-runner";
import { DeyPreview } from "./dey-preview";
import { KitchenPreview } from "./kitchen-preview";
import { RikaPreview } from "./rika-preview";
import { ShortPreview } from "./short-preview";

export const dynamic = "force-dynamic";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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

  const shortConfig = shortConfigForOffice(office.code);
  if (isDeyOffice(office.code)) {
    const input = await loadDeyGenerateInput(prisma, officeId, ym);
    const result = generateDey(input);
    const summary = summarizeDeyCoverage(result);
    employeeCount = input.employees.length;
    proposedCount = result.assignments.length;
    preview = <DeyPreview days={result.days} summary={summary} />;
  } else if (isKitchenOffice(office.code)) {
    const input = await loadKitchenGenerateInput(prisma, officeId, ym);
    const result = generateKitchen(input);
    const summary = summarizeKitchenCoverage(result);
    employeeCount = input.employees.length;
    proposedCount = result.assignments.length;
    preview = <KitchenPreview days={result.days} summary={summary} />;
  } else if (shortConfig) {
    const input = await loadShortGenerateInput(prisma, officeId, ym, shortConfig);
    const result = generateShort(input);
    const summary = summarizeShortCoverage(result);
    employeeCount = input.employees.length;
    proposedCount = result.assignments.length;
    preview = <ShortPreview days={result.days} summary={summary} />;
  } else if (isRikaOffice(office.code)) {
    const input = await loadRikaGenerateInput(prisma, ym);
    const result = generateRikaShifts(ym, input.members, input.requestOff);
    const summary = summarizeRikaCoverage(result, ym);
    employeeCount = input.members.length;
    proposedCount = result.cells.length;
    preview = <RikaPreview summary={summary} skipped={input.skipped.map((s) => s.name)} />;
  } else {
    // 専用生成を持たない拠点 (未対応)。
    preview = (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">この拠点は月次シフトの自動作成に対応していません。</p>
      </section>
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
