/**
 * マスターデータ投入スクリプト。
 *
 * - 5 拠点（offices）
 * - 約 30 種のシフトパターン（shift_patterns）
 *
 * すべて `code` を一意キーにした upsert で投入するため、複数回流しても
 * 重複は発生しない（更新があれば差分が当たる）。従業員 55 名のシードは
 * 別タスクで追加する。
 *
 * 実行: `pnpm db:seed`
 */
import { PrismaClient, ShiftKind } from "@prisma/client";
import { seedEmployees } from "./seeds/employees";
import { seedUsers, DEV_CREDENTIALS } from "./seeds/users";

const prisma = new PrismaClient();

// =============================================================================
// 拠点マスター（docs/shift-patterns.md §1）
// =============================================================================

type OfficeSeed = {
  code: string;
  name: string;
};

const OFFICES: OfficeSeed[] = [
  { code: "NRS-CENTER", name: "ナーシングホーム結いの心" },
  { code: "DAY-CENTER", name: "デイサービス結いの心" },
  { code: "SHO-CENTER", name: "ショートステイ結いの心" },
  { code: "DAY-RIKKA", name: "デイサービス梨花" },
  { code: "KITCHEN", name: "厨房" },
];

// =============================================================================
// シフトパターンマスター（docs/shift-patterns.md §2）
// =============================================================================

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
  officeCode?: string; // 省略時は office_id = NULL（全拠点共通扱い）
  color?: string;
  sortOrder?: number;
};

// 2.1 フル勤務系（24h 施設: NRS-CENTER / SHO-CENTER 兼用 → office_id NULL）
// 夜入は実際には 24:00 まで運用されているが、PostgreSQL TIME に Prisma 経由で
// 24:00 を入れるのが煩雑なため 23:59 で代用する。実労働時間の計算は
// attendance_records の打刻ペアから行うため、ここの値は管理画面の参考表示用。
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

// 2.2 フル勤務系（デイ / ショート専用）
const DAY_LIKE: PatternSeed[] = [
  // DAY-CENTER / DAY-RIKKA で共有運用のため NULL
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
  // SHO-CENTER 専用
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

// 2.3 半日系（拠点要確認のため一旦 NULL）
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

// 2.4 デイサービス結いの心 専用
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

// 2.5 ショートステイ結いの心 専用
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

// 2.6 デイサービス梨花 専用
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

// 2.7 厨房 専用
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

// 2.8 休み系（全拠点共通: office_id NULL）
const OFF_LIKE: PatternSeed[] = [
  { code: "OFF", name: "公休", shiftKind: "OFF", color: "#e5e7eb", sortOrder: 900 },
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

// 2.9 複合パターン（半休 + 勤務）
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

const PATTERNS: PatternSeed[] = [
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

// =============================================================================
// Upsert
// =============================================================================

async function seedOffices(): Promise<Map<string, string>> {
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

async function seedShiftPatterns(officeIds: Map<string, string>): Promise<void> {
  for (const p of PATTERNS) {
    const officeId = p.officeCode ? (officeIds.get(p.officeCode) ?? null) : null;
    if (p.officeCode && !officeId) {
      throw new Error(`shift pattern ${p.code} references unknown office ${p.officeCode}`);
    }

    const data = {
      code: p.code,
      name: p.name,
      shiftKind: p.shiftKind,
      startTime: p.start ? t(p.start) : null,
      endTime: p.end ? t(p.end) : null,
      crossesMidnight: p.crossesMidnight ?? false,
      breakMinutes: p.breakMinutes ?? 0,
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

async function main(): Promise<void> {
  console.log("seeding offices...");
  const officeIds = await seedOffices();
  console.log(`  ${officeIds.size} offices upserted`);

  console.log("seeding shift patterns...");
  await seedShiftPatterns(officeIds);
  console.log(`  ${PATTERNS.length} patterns upserted`);

  console.log("seeding employees...");
  const employeeCount = await seedEmployees(prisma, officeIds);
  console.log(`  ${employeeCount} employees upserted`);

  console.log("seeding users...");
  const users = await seedUsers(prisma);
  console.log(`  ${users.admin} admin + ${users.employee} employee users ready`);

  const counts = {
    offices: await prisma.office.count(),
    shiftPatterns: await prisma.shiftPattern.count(),
    employees: await prisma.employee.count(),
    users: await prisma.user.count(),
  };
  console.log("done.", counts);
  console.log("");
  console.log("  ── dev login (開発専用 / 本番投入禁止) ──");
  console.log(`  admin   : ${DEV_CREDENTIALS.admin.email} / ${DEV_CREDENTIALS.admin.password}`);
  console.log(`  employee: e0001..e0055@kinntai.local / ${DEV_CREDENTIALS.employeePassword}`);
  console.log(`  tablet PIN: ${DEV_CREDENTIALS.employeePinHint}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
