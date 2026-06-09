/**
 * デイサービス梨花 シフト自動生成 画面 (設計書 §4)。
 *
 * 職員 × 日付グリッド + 集計行 + 色分けの表示。保存済みシフトは DB から読み込んで
 * 初期表示する (自動生成 → DB保存後にページを開き直しても消えないようにするため)。
 */
import { currentJstYm, monthRange, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  RIKA_OFFICE_CODE,
  RIKA_ROSTER,
  RIKA_STAFFING,
  RIKA_SYMBOLS,
  type RikaSymbolCode,
} from "@/lib/shift/rika/config";
import { buildRikaMonth, type RikaCell } from "@/lib/shift/rika/grid";

import { RikaGrid } from "./rika-grid";

export const dynamic = "force-dynamic";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type SearchParams = { ym?: string };
type Props = { searchParams: Promise<SearchParams> };

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

/** DB の ShiftPattern.code が梨花の勤務記号かどうか (不明な code は無視する)。 */
function isRikaSymbol(code: string): code is RikaSymbolCode {
  return Object.prototype.hasOwnProperty.call(RIKA_SYMBOLS, code);
}

/**
 * 当月の梨花シフトを DB から読み込み、グリッドのセル (氏名 / 日付 / 記号) に戻す。
 * 保存時 (actions.saveRikaShifts) は memberId=Employee.lastName / symbol=ShiftPattern.code
 * で書き込むため、ここでも同じ対応で復元する。
 */
async function loadRikaCells(ym: string): Promise<RikaCell[]> {
  const office = await prisma.office.findFirst({
    where: { code: RIKA_OFFICE_CODE },
    select: { id: true },
  });
  if (!office) return [];

  const range = monthRange(ym);
  const shifts = await prisma.shift.findMany({
    where: {
      officeId: office.id,
      workDate: { gte: range.start, lt: range.end },
    },
    select: {
      workDate: true,
      employee: { select: { lastName: true } },
      shiftPattern: { select: { code: true } },
    },
  });

  const cells: RikaCell[] = [];
  for (const s of shifts) {
    const code = s.shiftPattern.code;
    if (!isRikaSymbol(code)) continue;
    cells.push({
      memberId: s.employee.lastName,
      date: toJstYmd(s.workDate),
      symbol: code,
    });
  }
  return cells;
}

export default async function AdminRikaShiftPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const ym = sp.ym && YM_PATTERN.test(sp.ym) ? sp.ym : currentJstYm();

  const days = buildRikaMonth(ym);
  const initialCells = await loadRikaCells(ym);
  const members = RIKA_ROSTER.map((m) => ({
    id: m.name,
    name: m.name,
    employmentClass: m.employmentClass,
    jobLabel: m.jobLabel,
    targetWorkDays: m.targetWorkDays ?? null,
    maxWorkDaysPerWeek: m.maxWorkDaysPerWeek ?? null,
    isHelper: m.isHelper ?? false,
    allowedSymbols: [...m.allowedSymbols],
    note: m.note ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">梨花シフト ({formatYm(ym)})</h1>
        <p className="mt-1 text-sm text-slate-500">
          デイサービス梨花の月次シフト。営業日は 月・火・木・金、配置基準は 午前
          {RIKA_STAFFING.morning}名・午後{RIKA_STAFFING.afternoon}名。 まずは「自動で組む →
          過不足を色で見る → 手で直す」を前提にした表示です (現在は空の状態)。
        </p>
      </header>

      <RikaGrid
        key={ym}
        ym={ym}
        prevYm={shiftYm(ym, -1)}
        nextYm={shiftYm(ym, 1)}
        days={days}
        members={members}
        initialCells={initialCells}
      />
    </div>
  );
}
