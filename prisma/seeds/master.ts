/**
 * 拠点 / シフトパターンのマスター投入。
 *
 * 開発用 `seed.ts` と本番用 `seed-prod.ts` の両方から呼ぶ。
 * 値は docs/shift-patterns.md と現運用 (株式会社クロスハート) の実値。
 * upsert なので複数回流しても重複しない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient, ShiftKind } from "@prisma/client";

import { parseSymbolMaster, type SymbolMaster } from "../../src/lib/shift/coverage";

type OfficeSeed = {
  code: string;
  name: string;
};

/**
 * 勤務記号マスター_確定.csv から午前/午後カウントを読む (記号定義の正)。
 * CSV が読めない環境では空マップを返し、am/pm=0 で seed する
 * (sync-coverage.ts で後追い反映できる)。
 */
function loadCoverage(): SymbolMaster {
  try {
    return parseSymbolMaster(
      readFileSync(join(process.cwd(), "勤務記号マスター_確定.csv"), "utf8"),
    );
  } catch (e) {
    console.warn("勤務記号マスターを読めませんでした。am/pm=0 で seed します:", e);
    return new Map();
  }
}

export const OFFICES: OfficeSeed[] = [
  { code: "NRS-CENTER", name: "ナーシングホーム結いの心" },
  { code: "DAY-CENTER", name: "デイサービス結いの心" },
  { code: "SHO-CENTER", name: "ショートステイ結いの心" },
  { code: "DAY-RIKKA", name: "デイサービス梨花" },
  { code: "KITCHEN", name: "厨房" },
];

/**
 * `HH:MM` を Prisma `@db.Time(0)` 用の Date に変換する。
 * 1970-01-01 UTC 固定にしておけば、TIME 列に格納される際は時刻部分のみ
 * 取り出されるため日付・タイムゾーンの混入を避けられる。
 */
function t(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

type PatternSeed = {
  code: string;
  name: string;
  shiftKind: ShiftKind;
  start?: string;
  end?: string;
  crossesMidnight?: boolean;
  breakMinutes?: number;
  paidLeaveUnits?: number;
  officeCode?: string;
  color?: string;
  sortOrder?: number;
};

const FULL_24H: PatternSeed[] = [
  {
    code: "EARLY",
    name: "早",
    shiftKind: "WORK",
    start: "06:30",
    end: "15:30",
    breakMinutes: 60,
    color: "#fbbf24",
    sortOrder: 10,
  },
  {
    code: "DAY",
    name: "日勤",
    shiftKind: "WORK",
    start: "08:15",
    end: "17:15",
    breakMinutes: 60,
    color: "#60a5fa",
    sortOrder: 20,
  },
  {
    code: "LATE",
    name: "遅",
    shiftKind: "WORK",
    start: "10:00",
    end: "19:00",
    breakMinutes: 60,
    color: "#fb923c",
    sortOrder: 30,
  },
  {
    code: "NIGHT_IN",
    name: "夜入",
    shiftKind: "NIGHT_IN",
    start: "16:30",
    end: "23:59",
    breakMinutes: 30,
    color: "#4f46e5",
    sortOrder: 40,
  },
  {
    code: "NIGHT_OUT",
    name: "夜明",
    shiftKind: "NIGHT_OUT",
    start: "00:00",
    end: "08:30",
    breakMinutes: 30,
    color: "#a78bfa",
    sortOrder: 50,
  },
];

const DAY_LIKE: PatternSeed[] = [
  {
    code: "DAY_CARE",
    name: "デ日",
    shiftKind: "WORK",
    start: "08:15",
    end: "17:15",
    breakMinutes: 60,
    color: "#86efac",
    sortOrder: 100,
  },
  {
    code: "DAY_SHORT",
    name: "ショ日",
    shiftKind: "WORK",
    start: "08:15",
    end: "17:15",
    breakMinutes: 60,
    officeCode: "SHO-CENTER",
    color: "#7dd3fc",
    sortOrder: 110,
  },
];

const HALF: PatternSeed[] = [
  {
    code: "HALF_A",
    name: "半日A",
    shiftKind: "WORK",
    start: "09:00",
    end: "12:00",
    color: "#d1d5db",
    sortOrder: 200,
  },
  {
    code: "HALF_B",
    name: "半日B",
    shiftKind: "WORK",
    start: "08:30",
    end: "12:00",
    color: "#d1d5db",
    sortOrder: 210,
  },
  {
    code: "HALF_C",
    name: "半日C",
    shiftKind: "WORK",
    start: "08:45",
    end: "12:00",
    color: "#d1d5db",
    sortOrder: 220,
  },
  {
    code: "HALF_D",
    name: "半日D",
    shiftKind: "WORK",
    start: "08:15",
    end: "12:00",
    color: "#d1d5db",
    sortOrder: 230,
  },
  {
    code: "HALF_E",
    name: "半日E",
    shiftKind: "WORK",
    start: "09:00",
    end: "11:00",
    color: "#d1d5db",
    sortOrder: 240,
  },
  {
    code: "HALF_F",
    name: "半日F",
    shiftKind: "WORK",
    start: "08:45",
    end: "13:00",
    color: "#d1d5db",
    sortOrder: 250,
  },
  {
    code: "HALF_PM",
    name: "半日午後",
    shiftKind: "WORK",
    start: "13:00",
    end: "16:15",
    color: "#d1d5db",
    sortOrder: 260,
  },
];

const DC: PatternSeed[] = [
  {
    code: "DC_A",
    name: "デ短A",
    shiftKind: "WORK",
    start: "09:00",
    end: "16:15",
    breakMinutes: 60,
    officeCode: "DAY-CENTER",
    color: "#bbf7d0",
    sortOrder: 300,
  },
  {
    code: "DC_B",
    name: "デ短B",
    shiftKind: "WORK",
    start: "08:30",
    end: "16:15",
    breakMinutes: 60,
    officeCode: "DAY-CENTER",
    color: "#bbf7d0",
    sortOrder: 310,
  },
  {
    code: "DC_C",
    name: "デ短C",
    shiftKind: "WORK",
    start: "08:30",
    end: "17:15",
    breakMinutes: 60,
    officeCode: "DAY-CENTER",
    color: "#bbf7d0",
    sortOrder: 320,
  },
  {
    code: "DC_D",
    name: "デ短D",
    shiftKind: "WORK",
    start: "08:15",
    end: "16:15",
    breakMinutes: 60,
    officeCode: "DAY-CENTER",
    color: "#bbf7d0",
    sortOrder: 330,
  },
  {
    code: "DC_E",
    name: "デ短E",
    shiftKind: "WORK",
    start: "09:00",
    end: "17:15",
    breakMinutes: 60,
    officeCode: "DAY-CENTER",
    color: "#bbf7d0",
    sortOrder: 340,
  },
];

const SC: PatternSeed[] = [
  {
    code: "SC_A",
    name: "ショ短A",
    shiftKind: "WORK",
    start: "08:15",
    end: "16:00",
    breakMinutes: 60,
    officeCode: "SHO-CENTER",
    color: "#bae6fd",
    sortOrder: 400,
  },
];

const RK: PatternSeed[] = [
  {
    code: "RK_1",
    name: "梨1",
    shiftKind: "WORK",
    start: "08:45",
    end: "12:00",
    officeCode: "DAY-RIKKA",
    color: "#fbcfe8",
    sortOrder: 500,
  },
  {
    code: "RK_2",
    name: "梨2",
    shiftKind: "WORK",
    start: "09:00",
    end: "12:00",
    officeCode: "DAY-RIKKA",
    color: "#fbcfe8",
    sortOrder: 510,
  },
  {
    code: "RK_3",
    name: "梨3",
    shiftKind: "WORK",
    start: "08:45",
    end: "16:15",
    breakMinutes: 60,
    officeCode: "DAY-RIKKA",
    color: "#fbcfe8",
    sortOrder: 520,
  },
  {
    code: "RK_4",
    name: "梨4",
    shiftKind: "WORK",
    start: "08:45",
    end: "17:15",
    breakMinutes: 60,
    officeCode: "DAY-RIKKA",
    color: "#fbcfe8",
    sortOrder: 530,
  },
  {
    code: "RK_5",
    name: "梨5",
    shiftKind: "WORK",
    start: "09:00",
    end: "16:15",
    breakMinutes: 60,
    officeCode: "DAY-RIKKA",
    color: "#fbcfe8",
    sortOrder: 540,
  },
];

const KT: PatternSeed[] = [
  {
    code: "KT_A",
    name: "厨房A",
    shiftKind: "WORK",
    start: "09:30",
    end: "18:30",
    breakMinutes: 60,
    officeCode: "KITCHEN",
    color: "#fde68a",
    sortOrder: 600,
  },
  {
    code: "KT_B",
    name: "厨房B",
    shiftKind: "WORK",
    start: "09:00",
    end: "18:00",
    breakMinutes: 60,
    officeCode: "KITCHEN",
    color: "#fde68a",
    sortOrder: 610,
  },
  {
    code: "KT_C",
    name: "厨房C",
    shiftKind: "WORK",
    start: "09:00",
    end: "16:00",
    breakMinutes: 60,
    officeCode: "KITCHEN",
    color: "#fde68a",
    sortOrder: 620,
  },
];

const OFF_LIKE: PatternSeed[] = [
  { code: "OFF", name: "公休", shiftKind: "OFF", color: "#2dd4bf", sortOrder: 900 },
  {
    code: "PAID_LEAVE",
    name: "有休",
    shiftKind: "PAID_LEAVE",
    paidLeaveUnits: 1.0,
    color: "#fde68a",
    sortOrder: 910,
  },
  { code: "ABSENCE", name: "欠勤", shiftKind: "ABSENCE", color: "#fca5a5", sortOrder: 920 },
  {
    code: "REQUESTED_OFF",
    name: "希望休",
    shiftKind: "REQUESTED_OFF",
    color: "#f9a8d4",
    sortOrder: 930,
  },
];

const COMPOSITE: PatternSeed[] = [
  {
    code: "AM_LEAVE_PM_DAY",
    name: "有/日",
    shiftKind: "WORK",
    start: "13:00",
    end: "17:15",
    paidLeaveUnits: 0.5,
    color: "#fef08a",
    sortOrder: 940,
  },
  {
    code: "AM_DAY_PM_LEAVE",
    name: "日/有",
    shiftKind: "WORK",
    start: "08:15",
    end: "12:30",
    paidLeaveUnits: 0.5,
    color: "#fef08a",
    sortOrder: 950,
  },
];

export const PATTERNS: PatternSeed[] = [
  ...FULL_24H,
  ...DAY_LIKE,
  ...HALF,
  ...DC,
  ...SC,
  ...RK,
  ...KT,
  ...OFF_LIKE,
  ...COMPOSITE,
];

export async function seedOffices(prisma: PrismaClient): Promise<Map<string, string>> {
  const codeToId = new Map<string, string>();
  for (const o of OFFICES) {
    const row = await prisma.office.upsert({
      where: { code: o.code },
      update: { name: o.name },
      create: { code: o.code, name: o.name },
    });
    codeToId.set(o.code, row.id);
  }
  return codeToId;
}

export async function seedShiftPatterns(
  prisma: PrismaClient,
  officeIds: Map<string, string>,
): Promise<void> {
  // 午前/午後カウントは勤務記号マスター CSV を正とし name で引く (docs/auto-shift-design-v2.md 案A)。
  const coverage = loadCoverage();
  for (const p of PATTERNS) {
    const officeId = p.officeCode ? (officeIds.get(p.officeCode) ?? null) : null;
    if (p.officeCode && !officeId) {
      throw new Error(`shift pattern ${p.code} references unknown office ${p.officeCode}`);
    }
    const cov = coverage.get(p.name);

    const data = {
      code: p.code,
      name: p.name,
      shiftKind: p.shiftKind,
      startTime: p.start ? t(p.start) : null,
      endTime: p.end ? t(p.end) : null,
      crossesMidnight: p.crossesMidnight ?? false,
      breakMinutes: p.breakMinutes ?? 0,
      amCount: cov?.amCount ?? 0,
      pmCount: cov?.pmCount ?? 0,
      paidLeaveUnits: p.paidLeaveUnits ?? 0,
      officeId,
      color: p.color ?? "#888888",
      sortOrder: p.sortOrder ?? 0,
      isActive: true,
    };

    await prisma.shiftPattern.upsert({
      where: { code: p.code },
      update: data,
      create: data,
    });
  }
}
