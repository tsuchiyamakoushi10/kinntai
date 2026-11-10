/**
 * 昇給通知書の金額行の組み立て・検証・労働条件通知書への引き継ぎ (純関数)。
 * docs/raise-notice.md §2。
 */
import { LEGACY_ALLOWANCE_CODES, QUALIFICATION_LABEL } from "@/lib/labor-notice/constants";
import { isValidYmd } from "@/lib/labor-notice/dates";
import { allowanceTypesFor, setAllowanceYen } from "@/lib/labor-notice/masters";
import type {
  NoticeAllowanceType,
  NoticeEmploymentType,
  NoticeInput,
  NoticeWageInput,
  QualificationAllowances,
} from "@/lib/labor-notice/types";

import type {
  LegacyRaiseRowKey,
  RaiseInput,
  RaiseRow,
  RaiseRowKey,
  RaiseUnit,
  RaiseWageKind,
} from "./types";

const BASE_LABEL: Record<RaiseWageKind, string> = {
  MONTHLY: "基本給",
  HOURLY: "時給",
  NIGHT_DAILY: "夜勤 1 回あたり",
};

const BASE_UNIT: Record<RaiseWageKind, RaiseUnit> = {
  MONTHLY: "MONTH",
  HOURLY: "HOUR",
  NIGHT_DAILY: "NIGHT",
};

export const UNIT_LABEL: Record<RaiseUnit, string> = {
  MONTH: "月額",
  HOUR: "時給",
  NIGHT: "1回",
};

/** 契約データ (employment_contracts.wage_type) に書く賃金の形 */
export const KIND_TO_WAGE_TYPE = {
  MONTHLY: "MONTHLY",
  HOURLY: "HOURLY",
  NIGHT_DAILY: "DAILY",
} as const satisfies Record<RaiseWageKind, string>;

/** 賃金の形に対応する通知書の区分 (作成画面で区分ごとに賃金の形が決まっている) */
const KIND_TO_NOTICE_TYPE: Record<RaiseWageKind, NoticeEmploymentType> = {
  MONTHLY: "FULL_TIME",
  HOURLY: "PART_TIME",
  NIGHT_DAILY: "NIGHT_ONLY",
};

function row(key: RaiseRowKey, label: string, unit: RaiseUnit, yen: number): RaiseRow {
  return { key, label, unit, beforeYen: yen, afterYen: yen };
}

function allowanceRow(code: string, label: string, yen: number): RaiseRow {
  return { key: "ALLOWANCE", code, label, unit: "MONTH", beforeYen: yen, afterYen: yen };
}

const LEGACY_KEY_TO_CODE: Record<LegacyRaiseRowKey, string> = {
  MANAGER: LEGACY_ALLOWANCE_CODES.manager,
  COUNSELOR: LEGACY_ALLOWANCE_CODES.counselor,
};

/** 2026-11-10 より前の snapshot の行 (key: MANAGER / COUNSELOR) を ALLOWANCE に読み替える */
export function normalizeRaiseRow(r: RaiseRow): RaiseRow {
  const legacy = LEGACY_KEY_TO_CODE[r.key as unknown as LegacyRaiseRowKey];
  return legacy ? { ...r, key: "ALLOWANCE", code: legacy } : r;
}

/** 労働条件通知書の基本給・資格手当から、変更前 = 変更後 = 今の金額の行を作る */
export function rowsFromWage(
  wage: NoticeWageInput,
  qualificationDefaults: QualificationAllowances,
): RaiseRow[] {
  const rows: RaiseRow[] = [];
  const base =
    wage.kind === "MONTHLY"
      ? wage.baseYen
      : wage.kind === "HOURLY"
        ? wage.hourlyYen
        : wage.totalYen;
  rows.push(row("BASE", BASE_LABEL[wage.kind], BASE_UNIT[wage.kind], base));
  if (wage.kind !== "NIGHT_DAILY" && wage.qualification !== "NONE") {
    const yen = wage.qualificationAllowanceYen ?? qualificationDefaults[wage.qualification] ?? 0;
    rows.push(
      row("QUALIFICATION", `資格手当（${QUALIFICATION_LABEL[wage.qualification]}）`, "MONTH", yen),
    );
  }
  return rows;
}

/**
 * 労働条件通知書の入力から行を作る。人ごとの手当は、その区分に載せる使用中の種類を
 * 0 円でも出す (0 円から昇給できるように)。
 */
export function rowsFromNotice(
  input: Pick<NoticeInput, "employmentType" | "wage" | "allowances">,
  qualificationDefaults: QualificationAllowances,
  allowanceTypes: ReadonlyArray<NoticeAllowanceType>,
): RaiseRow[] {
  const rows = rowsFromWage(input.wage, qualificationDefaults);
  for (const t of allowanceTypesFor(allowanceTypes, input.employmentType, input.allowances)) {
    const yen = input.allowances.find((a) => a.code === t.code)?.yen ?? 0;
    rows.push(allowanceRow(t.code, t.label, yen));
  }
  return rows;
}

/** 労働条件通知書がない従業員: 従業員データの基本給だけの行 */
export function rowsFromBase(kind: RaiseWageKind, baseYen: number): RaiseRow[] {
  return [row("BASE", BASE_LABEL[kind], BASE_UNIT[kind], baseYen)];
}

/**
 * 前回の昇給通知の変更後を、次の昇給通知の変更前にする。
 * 前回より後に設定で足した人ごとの手当の種類は 0 円の行で足す (追加した手当の行より前)。
 */
export function rowsFromPreviousRaise(
  prev: ReadonlyArray<RaiseRow>,
  kind: RaiseWageKind,
  allowanceTypes: ReadonlyArray<NoticeAllowanceType>,
): RaiseRow[] {
  const rows = prev
    .map(normalizeRaiseRow)
    .filter((r) => r.key !== "OTHER" || r.afterYen > 0)
    .map((r) => ({ ...r, beforeYen: r.afterYen }));
  const type = KIND_TO_NOTICE_TYPE[kind];
  const added = allowanceTypes
    .filter(
      (t) =>
        t.isActive &&
        t.targetTypes.includes(type) &&
        !rows.some((r) => r.key === "ALLOWANCE" && r.code === t.code),
    )
    .map((t) => allowanceRow(t.code, t.label, 0));
  const firstOther = rows.findIndex((r) => r.key === "OTHER");
  const at = firstOther === -1 ? rows.length : firstOther;
  return [...rows.slice(0, at), ...added, ...rows.slice(at)];
}

export function emptyOtherRow(): RaiseRow {
  return row("OTHER", "", "MONTH", 0);
}

/** 書面に載せる行 (変更前も変更後も 0 円の行は出さない) */
export function visibleRows(rows: ReadonlyArray<RaiseRow>): RaiseRow[] {
  return rows.filter((r) => r.beforeYen > 0 || r.afterYen > 0);
}

/** 月額の合計 (月給のときだけ。時給・日給は単位が混ざるので出さない) */
export function monthlyTotals(
  kind: RaiseWageKind,
  rows: ReadonlyArray<RaiseRow>,
): { beforeYen: number; afterYen: number } | null {
  if (kind !== "MONTHLY") return null;
  const monthly = rows.filter((r) => r.unit === "MONTH");
  return {
    beforeYen: monthly.reduce((s, r) => s + r.beforeYen, 0),
    afterYen: monthly.reduce((s, r) => s + r.afterYen, 0),
  };
}

export type RaiseCheck = { errors: string[]; warnings: string[] };

export function checkRaise(input: RaiseInput): RaiseCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isValidYmd(input.issuedOn)) errors.push("通知する日を入力してください");
  if (!isValidYmd(input.effectiveOn)) errors.push("新しい金額にする日を入力してください");
  const base = input.rows.find((r) => r.key === "BASE");
  if (!base || !(base.afterYen > 0))
    errors.push(`変更後の${BASE_LABEL[input.kind]}を入力してください`);
  if (input.rows.some((r) => r.key === "OTHER" && r.label.trim() === "" && r.afterYen > 0)) {
    errors.push("追加した手当の名前を入力してください");
  }
  if (input.rows.every((r) => r.afterYen === r.beforeYen)) {
    errors.push("金額が変わっていません。変更後の金額を入力してください");
  }
  for (const r of input.rows) {
    if (r.afterYen < r.beforeYen) warnings.push(`${r.label || "手当"}が下がっています`);
  }
  return { errors, warnings };
}

/**
 * 昇給の変更後の金額を労働条件通知書の入力 (賃金・人ごとの手当) に写す。次の通知書
 * (更新・無期切替) を新しい金額から始めるために使う。賃金の形が違う (月給 → 時給 など) ときは写さない。
 */
export function applyRaiseToNotice<T extends Pick<NoticeInput, "wage" | "allowances">>(
  input: T,
  kind: RaiseWageKind,
  rows: ReadonlyArray<RaiseRow>,
): T {
  if (input.wage.kind !== kind) return input;
  let allowances = input.allowances;
  for (const r of rows.map(normalizeRaiseRow)) {
    if (r.key === "ALLOWANCE" && r.code)
      allowances = setAllowanceYen(allowances, r.code, r.afterYen);
  }
  return { ...input, wage: applyRaiseToWage(input.wage, kind, rows), allowances };
}

/** 昇給の変更後の基本給・資格手当を賃金に写す。賃金の形が違うときは写さない */
export function applyRaiseToWage(
  wage: NoticeWageInput,
  kind: RaiseWageKind,
  rows: ReadonlyArray<RaiseRow>,
): NoticeWageInput {
  if (wage.kind !== kind) return wage;
  const after = (key: RaiseRowKey): number | undefined => rows.find((r) => r.key === key)?.afterYen;
  const base = after("BASE");
  switch (wage.kind) {
    case "MONTHLY":
      return {
        ...wage,
        baseYen: base ?? wage.baseYen,
        qualificationAllowanceYen: after("QUALIFICATION") ?? wage.qualificationAllowanceYen,
      };
    case "HOURLY":
      return {
        ...wage,
        hourlyYen: base ?? wage.hourlyYen,
        qualificationAllowanceYen: after("QUALIFICATION") ?? wage.qualificationAllowanceYen,
      };
    case "NIGHT_DAILY":
      return { ...wage, totalYen: base ?? wage.totalYen };
  }
}

const KINDS: ReadonlyArray<RaiseWageKind> = ["MONTHLY", "HOURLY", "NIGHT_DAILY"];
const KEYS: ReadonlyArray<RaiseRowKey> = ["BASE", "QUALIFICATION", "ALLOWANCE", "OTHER"];
const ALLOWANCE_CODE = /^[A-Z0-9_]{1,32}$/;
const UNITS: ReadonlyArray<RaiseUnit> = ["MONTH", "HOUR", "NIGHT"];
const MAX_ROWS = 12;

const isYen = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000_000;

/** 画面から届いた入力を検証する。形が合わなければ null */
export function parseRaiseInput(raw: unknown): RaiseInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.issuedOn !== "string" || typeof o.effectiveOn !== "string") return null;
  if (!KINDS.includes(o.kind as RaiseWageKind)) return null;
  if (typeof o.message !== "string" || o.message.length > 500) return null;
  if (!Array.isArray(o.rows) || o.rows.length === 0 || o.rows.length > MAX_ROWS) return null;
  const rows: RaiseRow[] = [];
  for (const r of o.rows as unknown[]) {
    if (typeof r !== "object" || r === null) return null;
    const x = r as Record<string, unknown>;
    if (!KEYS.includes(x.key as RaiseRowKey) || !UNITS.includes(x.unit as RaiseUnit)) return null;
    if (typeof x.label !== "string" || x.label.length > 40) return null;
    if (!isYen(x.beforeYen) || !isYen(x.afterYen)) return null;
    const key = x.key as RaiseRowKey;
    if (key === "ALLOWANCE" && !(typeof x.code === "string" && ALLOWANCE_CODE.test(x.code))) {
      return null;
    }
    rows.push({
      key,
      ...(key === "ALLOWANCE" ? { code: x.code as string } : {}),
      label: x.label.trim(),
      unit: x.unit as RaiseUnit,
      beforeYen: x.beforeYen,
      afterYen: x.afterYen,
    });
  }
  // 引き継ぐ項目は 1 行ずつ
  const mapped = rows.filter((r) => r.key !== "OTHER").map((r) => `${r.key}:${r.code ?? ""}`);
  if (new Set(mapped).size !== mapped.length) return null;
  return {
    issuedOn: o.issuedOn,
    effectiveOn: o.effectiveOn,
    kind: o.kind as RaiseWageKind,
    rows,
    message: o.message.trim(),
  };
}
