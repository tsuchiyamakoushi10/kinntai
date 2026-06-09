import Link from "next/link";
import { redirect } from "next/navigation";

import { currentJstYm, monthRange } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { RIKA_OFFICE_CODE } from "@/lib/shift/rika/config";
import type { ShiftCell } from "@/lib/shifts/diff";

import { AutoGenerateButton } from "./auto-generate-button";
import { ShiftFilters } from "./shift-filters";
import { ShiftGrid, type EmployeeRow, type PatternOption } from "./shift-grid";

export const dynamic = "force-dynamic";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type SearchParams = { officeId?: string; ym?: string };
type Props = { searchParams: Promise<SearchParams> };

function formatYmDisplay(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminShiftsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const ym = sp.ym && YM_PATTERN.test(sp.ym) ? sp.ym : currentJstYm();
  const officeId = sp.officeId ?? "";

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });

  // 梨花は専用画面 (午前/午後の頭数・専用ロスター・専用自動生成) を使う。
  // 勤務表で梨花を選んだら専用画面へ送る (メニューは勤務表に一本化)。
  const selected = offices.find((o) => o.id === officeId);
  if (selected?.code === RIKA_OFFICE_CODE) {
    redirect(`/admin/shifts/rika?ym=${ym}`);
  }

  // 拠点未選択ならフィルタだけ表示してリターン
  if (!officeId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">勤務表</h1>
          <p className="mt-1 text-sm text-slate-500">編集する拠点と月を選んでください。</p>
        </header>
        <ShiftFilters offices={offices} values={{ officeId, ym }} />
      </div>
    );
  }

  // ALL モード: 全拠点を読み取り専用で並べる。編集は拠点を選び直して個別画面で行う。
  if (officeId === "all") {
    return <AllOfficesView offices={offices} ym={ym} />;
  }

  const range = monthRange(ym);
  const prevRange = monthRange(range.prevYm);

  const [office, employees, patterns, currentShifts, prevShifts, generationRun] = await Promise.all(
    [
      prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
      prisma.employee.findMany({
        where: {
          officeId,
          OR: [{ retiredAt: null }, { retiredAt: { gte: range.start } }],
        },
        orderBy: [{ employeeCode: "asc" }],
        select: {
          id: true,
          employeeCode: true,
          lastName: true,
          firstName: true,
          lastNameKana: true,
          firstNameKana: true,
          employmentType: true,
        },
      }),
      prisma.shiftPattern.findMany({
        where: {
          isActive: true,
          OR: [{ officeId }, { officeId: null }],
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          shiftKind: true,
          color: true,
          paidLeaveUnits: true,
        },
      }),
      prisma.shift.findMany({
        where: { officeId, workDate: { gte: range.start, lt: range.end } },
        select: {
          employeeId: true,
          workDate: true,
          shiftPatternId: true,
          note: true,
          generationRunId: true,
        },
      }),
      prisma.shift.findMany({
        where: { officeId, workDate: { gte: prevRange.start, lt: prevRange.end } },
        select: { employeeId: true, workDate: true, shiftPatternId: true, note: true },
      }),
      prisma.shiftGenerationRun.findUnique({
        where: { officeId_targetMonth: { officeId, targetMonth: range.start } },
        select: { status: true, confirmedAt: true, generatedAt: true },
      }),
    ],
  );

  if (!office) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-slate-500">拠点が見つかりませんでした。</p>
      </div>
    );
  }

  const employeeRows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    code: e.employeeCode,
    name: `${e.lastName} ${e.firstName}`,
    kana: `${e.lastNameKana ?? ""} ${e.firstNameKana ?? ""}`.trim(),
    employmentType: e.employmentType,
  }));

  const patternOptions: PatternOption[] = patterns.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    shiftKind: p.shiftKind,
    color: p.color,
    paidLeaveUnits: p.paidLeaveUnits.toNumber(),
  }));

  const initialCells: ShiftCell[] = currentShifts.map((s) => ({
    employeeId: s.employeeId,
    workDate: dateToYmd(s.workDate),
    shiftPatternId: s.shiftPatternId,
    note: s.note,
  }));

  const autoCellKeys = new Set<string>();
  for (const s of currentShifts) {
    if (s.generationRunId !== null) {
      autoCellKeys.add(`${s.employeeId}:${dateToYmd(s.workDate)}`);
    }
  }

  const prevCells: ShiftCell[] = prevShifts.map((s) => ({
    employeeId: s.employeeId,
    workDate: dateToYmd(s.workDate),
    shiftPatternId: s.shiftPatternId,
    note: s.note,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">勤務表</h1>
          <p className="mt-1 text-sm text-slate-500">
            {office.name}・{formatYmDisplay(ym)}・{employeeRows.length} 名
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutoGenerateButton officeId={officeId} ym={ym} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <Link
            href={`/admin/shifts?officeId=${officeId}&ym=${range.prevYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="前の月"
          >
            ←
          </Link>
          <span className="min-w-24 text-center text-base font-bold text-slate-900">
            {formatYmDisplay(ym)}
          </span>
          <Link
            href={`/admin/shifts?officeId=${officeId}&ym=${range.nextYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="次の月"
          >
            →
          </Link>
        </div>
      </header>

      <ShiftFilters offices={offices} values={{ officeId, ym }} />

      {generationRun && (
        <div
          role="status"
          className={
            generationRun.status === "CONFIRMED"
              ? "flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          }
        >
          <span>
            {generationRun.status === "CONFIRMED" ? (
              <>
                自動作成: <strong>確定済</strong> (
                {generationRun.confirmedAt?.toISOString().slice(0, 16).replace("T", " ")})
              </>
            ) : (
              <>
                自動作成: <strong>下書き中</strong> ・微調整後に S-A-26 から確定してください
              </>
            )}
          </span>
          <Link
            href={`/admin/shifts/auto?officeId=${officeId}&ym=${ym}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            自動作成画面へ →
          </Link>
        </div>
      )}

      {employeeRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          この拠点に在籍中の従業員がいません。
        </div>
      ) : (
        <ShiftGrid
          // 自動生成 (router.refresh) 後にグリッド内部状態を初期化し直すため、
          // 生成時刻を key に含めて再マウントさせる。手修正の保存では generatedAt は
          // 変わらないので再マウントは起きない。
          key={`${ym}-${generationRun?.generatedAt?.getTime() ?? "none"}`}
          officeId={officeId}
          ym={ym}
          days={range.days}
          employees={employeeRows}
          patterns={patternOptions}
          initialCells={initialCells}
          prevMonthCells={prevCells}
          autoCellKeys={autoCellKeys}
        />
      )}
    </div>
  );
}

async function AllOfficesView({
  offices,
  ym,
}: {
  offices: ReadonlyArray<{ id: string; name: string }>;
  ym: string;
}) {
  const range = monthRange(ym);
  const officeIds = offices.map((o) => o.id);

  // 全拠点を 1 クエリで取得 → 拠点 ID でグルーピング
  const [employees, patterns, currentShifts, generationRuns] = await Promise.all([
    prisma.employee.findMany({
      where: {
        officeId: { in: officeIds },
        OR: [{ retiredAt: null }, { retiredAt: { gte: range.start } }],
      },
      orderBy: [{ officeId: "asc" }, { employeeCode: "asc" }],
      select: {
        id: true,
        officeId: true,
        employeeCode: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        employmentType: true,
      },
    }),
    prisma.shiftPattern.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        shiftKind: true,
        color: true,
        paidLeaveUnits: true,
      },
    }),
    prisma.shift.findMany({
      where: { officeId: { in: officeIds }, workDate: { gte: range.start, lt: range.end } },
      select: {
        employeeId: true,
        officeId: true,
        workDate: true,
        shiftPatternId: true,
        note: true,
        generationRunId: true,
      },
    }),
    prisma.shiftGenerationRun.findMany({
      where: { officeId: { in: officeIds }, targetMonth: range.start },
      select: { officeId: true, status: true, confirmedAt: true },
    }),
  ]);

  const empByOffice = new Map<string, typeof employees>();
  for (const e of employees) {
    // 拠点未割当の従業員は勤務表に並べない (CSV 取り込みで officeId 空欄の人)。
    if (e.officeId === null) continue;
    const arr = empByOffice.get(e.officeId) ?? [];
    arr.push(e);
    empByOffice.set(e.officeId, arr);
  }

  const shiftsByOffice = new Map<string, typeof currentShifts>();
  for (const s of currentShifts) {
    const arr = shiftsByOffice.get(s.officeId) ?? [];
    arr.push(s);
    shiftsByOffice.set(s.officeId, arr);
  }

  const runByOffice = new Map(generationRuns.map((r) => [r.officeId, r] as const));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">勤務表 (全拠点)</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatYmDisplay(ym)}・{offices.length} 拠点・{employees.length} 名 (読み取り専用)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/shifts?officeId=all&ym=${range.prevYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="前の月"
          >
            ←
          </Link>
          <span className="min-w-24 text-center text-base font-bold text-slate-900">
            {formatYmDisplay(ym)}
          </span>
          <Link
            href={`/admin/shifts?officeId=all&ym=${range.nextYm}`}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="次の月"
          >
            →
          </Link>
        </div>
      </header>

      <ShiftFilters offices={offices} values={{ officeId: "all", ym }} />

      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        ALL モードは閲覧専用です。編集する場合は拠点を選び直してください。
      </p>

      {offices.map((office) => {
        const emps = empByOffice.get(office.id) ?? [];
        const sf = shiftsByOffice.get(office.id) ?? [];
        const run = runByOffice.get(office.id);
        if (emps.length === 0) return null;

        const officePatterns = patterns.filter(
          (p) => p.officeId === office.id || p.officeId === null,
        );
        const employeeRows: EmployeeRow[] = emps.map((e) => ({
          id: e.id,
          code: e.employeeCode,
          name: `${e.lastName} ${e.firstName}`,
          kana: `${e.lastNameKana ?? ""} ${e.firstNameKana ?? ""}`.trim(),
          employmentType: e.employmentType,
        }));
        const patternOptions: PatternOption[] = officePatterns.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          shiftKind: p.shiftKind,
          color: p.color,
          paidLeaveUnits: p.paidLeaveUnits.toNumber(),
        }));
        const initialCells: ShiftCell[] = sf.map((s) => ({
          employeeId: s.employeeId,
          workDate: dateToYmd(s.workDate),
          shiftPatternId: s.shiftPatternId,
          note: s.note,
        }));
        const autoKeys = new Set<string>();
        for (const s of sf) {
          if (s.generationRunId !== null) {
            autoKeys.add(`${s.employeeId}:${dateToYmd(s.workDate)}`);
          }
        }

        return (
          <section key={office.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {office.name}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {employeeRows.length} 名
                </span>
              </h2>
              <Link
                href={`/admin/shifts?officeId=${office.id}&ym=${ym}`}
                className="text-sm text-slate-600 hover:underline"
              >
                この拠点を編集 →
              </Link>
            </div>
            {run && (
              <div
                role="status"
                className={
                  run.status === "CONFIRMED"
                    ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
                    : "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
                }
              >
                自動作成: {run.status === "CONFIRMED" ? "確定済" : "下書き中"}
              </div>
            )}
            <ShiftGrid
              officeId={office.id}
              ym={ym}
              days={range.days}
              employees={employeeRows}
              patterns={patternOptions}
              initialCells={initialCells}
              prevMonthCells={[]}
              autoCellKeys={autoKeys}
              readOnly
            />
          </section>
        );
      })}
    </div>
  );
}
