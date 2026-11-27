/**
 * 名簿作成の条件 (URL のクエリ) の読み取りと書き出し。
 *
 * 条件は URL に載せて、画面のプレビューと印刷画面 (/print) で同じものを使う。
 * docs/requirements.md「名簿作成（印刷）」。
 */
import type { EmploymentType, Gender, JobCategory } from "@prisma/client";

import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";
import { parseDateInputValue, toDateInputValue } from "@/lib/format";

export const ROSTER_COLUMNS = [
  "kana",
  "office",
  "job",
  "type",
  "birth",
  "age",
  "gender",
  "joined",
] as const;
export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export const ROSTER_COLUMN_LABELS: Record<RosterColumn, string> = {
  kana: "フリガナ",
  office: "拠点",
  job: "職種",
  type: "雇用形態",
  birth: "生年月日",
  age: "年齢",
  gender: "性別",
  joined: "入社日",
};

export const MAX_BLANK_COLUMNS = 5;

const JOB_VALUES: JobCategory[] = [
  "CARE_WORKER",
  "NURSE",
  "LIFE_COUNSELOR",
  "CARE_MANAGER",
  "OFFICE_STAFF",
  "OTHER",
];
const TYPE_VALUES: EmploymentType[] = ["FULL_TIME", "PART_TIME_INSURED", "PART_TIME_UNINSURED"];
const GENDER_VALUES: Gender[] = ["MALE", "FEMALE", "OTHER"];

export type RosterSort = "office" | "kana" | "code";

export type RosterQuery = {
  title: string;
  officeIds: string[];
  jobs: JobCategory[];
  types: EmploymentType[];
  gender: Gender | null;
  ageMin: number | null;
  ageMax: number | null;
  /** 年齢を数える日 (YYYY-MM-DD)。 */
  refDate: string;
  includeOnLeave: boolean;
  nightOnly: boolean;
  /** 夜勤の有無を見る期間 (YYYY-MM-DD)。 */
  nightFrom: string;
  nightTo: string;
  columns: RosterColumn[];
  blanks: string[];
  sort: RosterSort;
  landscape: boolean;
  breakByOffice: boolean;
};

export type RawParams = Record<string, string | string[] | undefined>;

function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter((s) => s !== "");
}

function one(v: string | string[] | undefined): string {
  return list(v)[0] ?? "";
}

function age(v: string | string[] | undefined): number | null {
  const s = one(v);
  if (!/^\d{1,3}$/.test(s)) return null;
  return Number(s);
}

function dateOr(v: string | string[] | undefined, fallback: string): string {
  const s = one(v);
  return parseDateInputValue(s) ? s : fallback;
}

/** YYYY-MM-DD の日付を月単位でずらす (月末は丸める)。 */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export const DEFAULT_COLUMNS: RosterColumn[] = ["kana", "office", "job", "age"];

/**
 * クエリから条件を作る。`today` は JST の今日 (YYYY-MM-DD)。
 * フォームを一度も送っていない (cols が無い) ときは既定の項目を出す。
 */
export function parseRosterQuery(sp: RawParams, today: string): RosterQuery {
  const submitted = sp.submitted !== undefined;
  const cols = list(sp.cols).filter((c): c is RosterColumn =>
    (ROSTER_COLUMNS as readonly string[]).includes(c),
  );
  const ageMin = age(sp.ageMin);
  const ageMax = age(sp.ageMax);
  const nightTo = dateOr(sp.nightTo, today);
  const gender = one(sp.gender);
  const sort = one(sp.sort);
  return {
    title: one(sp.title).slice(0, 60) || "名簿",
    officeIds: list(sp.office),
    jobs: list(sp.job).filter((j): j is JobCategory => (JOB_VALUES as string[]).includes(j)),
    types: list(sp.type).filter((t): t is EmploymentType => (TYPE_VALUES as string[]).includes(t)),
    gender: (GENDER_VALUES as string[]).includes(gender) ? (gender as Gender) : null,
    ageMin,
    ageMax,
    refDate: dateOr(sp.refDate, today),
    includeOnLeave: one(sp.onLeave) === "1",
    nightOnly: one(sp.night) === "1",
    nightFrom: dateOr(sp.nightFrom, addMonths(nightTo, -6)),
    nightTo,
    columns: submitted ? cols : DEFAULT_COLUMNS,
    blanks: one(sp.blanks)
      .split(/[、,，]/)
      .map((s) => s.trim().slice(0, 20))
      .filter((s) => s !== "")
      .slice(0, MAX_BLANK_COLUMNS),
    sort: sort === "kana" || sort === "code" ? sort : "office",
    landscape: one(sp.orient) === "landscape",
    breakByOffice: one(sp.breakByOffice) === "1",
  };
}

/** 条件をクエリ文字列に戻す (印刷画面へのリンク用)。 */
export function rosterQueryToSearch(q: RosterQuery): string {
  const p = new URLSearchParams();
  p.set("submitted", "1");
  p.set("title", q.title);
  for (const id of q.officeIds) p.append("office", id);
  for (const j of q.jobs) p.append("job", j);
  for (const t of q.types) p.append("type", t);
  if (q.gender) p.set("gender", q.gender);
  if (q.ageMin !== null) p.set("ageMin", String(q.ageMin));
  if (q.ageMax !== null) p.set("ageMax", String(q.ageMax));
  p.set("refDate", q.refDate);
  if (q.includeOnLeave) p.set("onLeave", "1");
  if (q.nightOnly) p.set("night", "1");
  p.set("nightFrom", q.nightFrom);
  p.set("nightTo", q.nightTo);
  for (const c of q.columns) p.append("cols", c);
  if (q.blanks.length > 0) p.set("blanks", q.blanks.join("、"));
  p.set("sort", q.sort);
  if (q.landscape) p.set("orient", "landscape");
  if (q.breakByOffice) p.set("breakByOffice", "1");
  return p.toString();
}

/** JST の今日 (YYYY-MM-DD)。 */
export function todayJst(now: Date = new Date()): string {
  return toDateInputValue(now);
}

export type RosterPreset = {
  key: string;
  label: string;
  /** クエリに上書きする値。 */
  params: Record<string, string | string[]>;
};

/**
 * ひな形。条件の初期値を一度に入れるだけで、対象者の判定はしない
 * (健診の対象ルールは社長・管理者が条件を足して決める)。
 */
export const ROSTER_PRESETS: RosterPreset[] = [
  {
    key: "flu",
    label: "インフル予防接種",
    params: {
      title: "インフルエンザ予防接種 名簿",
      cols: ["kana", "office", "job", "age"],
      blanks: "希望（有・無）、接種日、接種場所",
    },
  },
  {
    key: "health",
    label: "健康診断",
    params: {
      title: "健康診断 受診者名簿",
      cols: ["kana", "office", "birth", "age", "gender"],
      blanks: "受診日、受診先、備考",
    },
  },
  {
    key: "health-night",
    label: "夜勤者の健康診断",
    params: {
      title: "夜勤従事者 健康診断 受診者名簿",
      cols: ["kana", "office", "birth", "age", "gender"],
      blanks: "受診日、受診先、備考",
      night: "1",
    },
  },
];

export function presetSearch(preset: RosterPreset): string {
  const p = new URLSearchParams();
  p.set("submitted", "1");
  for (const [k, v] of Object.entries(preset.params)) {
    for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  }
  return p.toString();
}

const GENDER_LABEL_SHORT: Record<Gender, string> = {
  MALE: "男性",
  FEMALE: "女性",
  OTHER: "その他",
};

function slash(ymd: string): string {
  return ymd.replaceAll("-", "/");
}

/** 名簿の上に小さく出す「抽出条件」の文。 */
export function describeRosterQuery(
  q: RosterQuery,
  officeNames: ReadonlyMap<string, string>,
): string {
  const parts: string[] = [];
  if (q.officeIds.length > 0)
    parts.push(`拠点: ${q.officeIds.map((id) => officeNames.get(id) ?? "?").join("・")}`);
  if (q.jobs.length > 0)
    parts.push(`職種: ${q.jobs.map((j) => JOB_CATEGORY_LABELS[j]).join("・")}`);
  if (q.types.length > 0)
    parts.push(`雇用形態: ${q.types.map((t) => EMPLOYMENT_TYPE_LABELS[t]).join("・")}`);
  if (q.gender) parts.push(`性別: ${GENDER_LABEL_SHORT[q.gender]}`);
  if (q.ageMin !== null || q.ageMax !== null) {
    const range =
      q.ageMin !== null && q.ageMax !== null
        ? q.ageMin === q.ageMax
          ? `${q.ageMin}歳`
          : `${q.ageMin}〜${q.ageMax}歳`
        : q.ageMin !== null
          ? `${q.ageMin}歳以上`
          : `${q.ageMax}歳以下`;
    parts.push(`年齢: ${range}（${slash(q.refDate)} 時点）`);
  }
  if (q.nightOnly) parts.push(`${slash(q.nightFrom)}〜${slash(q.nightTo)} に夜勤に入った人`);
  parts.push(q.includeOnLeave ? "在籍中・休職中" : "在籍中");
  return `抽出条件: ${parts.join(" / ")}`;
}
