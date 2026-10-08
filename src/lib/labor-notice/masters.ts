/**
 * 通知書の設定マスター (S-A-34) の検証と既定値との合成 (純関数)。
 *
 * - DB の行は画面から保存した値なので、壊れていたら既定値に戻す (帳票を止めない)。
 * - 保存時は同じ検証で弾き、エラー文言を画面に返す。
 * docs/labor-notice.md §2.1
 */
import type {
  AllowanceRow,
  MinWage,
  NoticePreset,
  NoticeWorkPattern,
  PresetTexts,
  QualificationAllowances,
} from "./types";

const TEXT_KEYS: ReadonlyArray<keyof PresetTexts> = [
  "workingTimeSystem",
  "holidays",
  "trialPeriod",
  "raise",
  "bonus",
  "retirementAllowance",
  "overtime",
  "holidayWork",
  "jobScope",
  "workplaceScope",
];
/** 空欄にしてよい (= 書面にその行を出さない) 文言 */
const NULLABLE_TEXT_KEYS: ReadonlyArray<keyof PresetTexts> = ["trialPeriod", "holidayWork"];
const QUAL_KEYS: ReadonlyArray<keyof QualificationAllowances> = [
  "CARE_WORKER",
  "INITIAL_TRAINING",
  "NURSE",
  "ASSISTANT_NURSE",
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TEXT = 300;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const PRESET_TEXT_LABEL: Record<keyof PresetTexts, string> = {
  workingTimeSystem: "勤務時間の決め方",
  holidays: "休日",
  trialPeriod: "試用期間",
  raise: "昇給",
  bonus: "賞与",
  retirementAllowance: "退職金",
  overtime: "残業",
  holidayWork: "休日出勤",
  workplaceScope: "勤務先が変わる可能性",
  jobScope: "仕事内容が変わる可能性",
};

function checkTexts(v: unknown): Checked<PresetTexts> {
  if (!isObj(v)) return { ok: false, error: "文言が読み取れません" };
  const out: Partial<PresetTexts> = {};
  for (const key of TEXT_KEYS) {
    const raw = v[key];
    const s = typeof raw === "string" ? raw.trim() : raw === null ? "" : null;
    if (s === null) return { ok: false, error: `${PRESET_TEXT_LABEL[key]}が読み取れません` };
    if (s.length > MAX_TEXT) {
      return { ok: false, error: `${PRESET_TEXT_LABEL[key]}は${MAX_TEXT}文字以内にしてください` };
    }
    if (s === "") {
      if (!NULLABLE_TEXT_KEYS.includes(key)) {
        return { ok: false, error: `${PRESET_TEXT_LABEL[key]}を入力してください` };
      }
      (out as Record<string, string | null>)[key] = null;
    } else {
      (out as Record<string, string | null>)[key] = s;
    }
  }
  return { ok: true, value: out as PresetTexts };
}

function checkAllowanceRows(v: unknown): Checked<AllowanceRow[]> {
  if (!Array.isArray(v) || v.length > 30) return { ok: false, error: "手当の行が読み取れません" };
  const rows: AllowanceRow[] = [];
  for (const r of v) {
    if (!isObj(r) || typeof r.label !== "string" || typeof r.body !== "string") {
      return { ok: false, error: "手当の行が読み取れません" };
    }
    const label = r.label.trim();
    const body = r.body.trim();
    if (label === "" && body === "") continue; // 空行は捨てる
    if (label === "" || body === "") {
      return { ok: false, error: "手当は「名前」と「金額・計算方法」の両方を入力してください" };
    }
    if (label.length > 50 || body.length > 200) {
      return { ok: false, error: "手当の文字数が多すぎます" };
    }
    rows.push(
      r.onlyIfWorksNight === true ? { label, body, onlyIfWorksNight: true } : { label, body },
    );
  }
  return { ok: true, value: rows };
}

function checkQualificationAllowances(v: unknown): Checked<QualificationAllowances> {
  if (!isObj(v)) return { ok: false, error: "資格手当が読み取れません" };
  const out = {} as QualificationAllowances;
  for (const k of QUAL_KEYS) {
    const x = v[k];
    if (x === null || x === undefined) out[k] = null;
    else if (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 1_000_000) out[k] = x;
    else return { ok: false, error: "資格手当は 0 以上の整数（円）で入力してください" };
  }
  return { ok: true, value: out };
}

export function checkPreset(
  v: unknown,
  knownPatternCodes: ReadonlyArray<string>,
): Checked<NoticePreset> {
  if (!isObj(v)) return { ok: false, error: "設定が読み取れません" };
  const texts = checkTexts(v.texts);
  if (!texts.ok) return texts;
  const rows = checkAllowanceRows(v.allowanceRows);
  if (!rows.ok) return rows;
  const quals = checkQualificationAllowances(v.qualificationAllowances);
  if (!quals.ok) return quals;

  const months = v.defaultFixedTermMonths;
  if (
    months !== null &&
    !(typeof months === "number" && Number.isInteger(months) && months >= 1 && months <= 60)
  ) {
    return { ok: false, error: "契約期間は 1〜60 か月で入力してください" };
  }
  if (typeof v.convertsToIndefinite !== "boolean")
    return { ok: false, error: "設定が読み取れません" };
  if (
    !Array.isArray(v.defaultPatternCodes) ||
    !v.defaultPatternCodes.every((c) => typeof c === "string" && knownPatternCodes.includes(c))
  ) {
    return { ok: false, error: "最初に選ぶ勤務パターンが読み取れません" };
  }
  return {
    ok: true,
    value: {
      texts: texts.value,
      defaultFixedTermMonths: months,
      // 期間の定めなしなら「満了後に無期へ切替」は意味を持たない
      convertsToIndefinite: months === null ? false : v.convertsToIndefinite,
      defaultPatternCodes: v.defaultPatternCodes as string[],
      allowanceRows: rows.value,
      qualificationAllowances: quals.value,
    },
  };
}

/** DB の行と既定値を合成する。壊れた値は既定値に戻す。 */
export function mergePreset(
  defaults: NoticePreset,
  row: {
    texts: unknown;
    defaultFixedTermMonths: number | null;
    convertsToIndefinite: boolean;
    defaultPatternCodes: ReadonlyArray<string>;
    allowanceRows: unknown;
    qualificationAllowances: unknown;
  } | null,
): NoticePreset {
  if (!row) return defaults;
  const texts = checkTexts(row.texts);
  const rows = checkAllowanceRows(row.allowanceRows);
  const quals = checkQualificationAllowances(row.qualificationAllowances);
  return {
    texts: texts.ok ? texts.value : defaults.texts,
    defaultFixedTermMonths: row.defaultFixedTermMonths,
    convertsToIndefinite: row.convertsToIndefinite,
    defaultPatternCodes: row.defaultPatternCodes,
    allowanceRows: rows.ok ? rows.value : defaults.allowanceRows,
    qualificationAllowances: quals.ok ? quals.value : defaults.qualificationAllowances,
  };
}

export type WorkPatternInput = NoticeWorkPattern & { isActive: boolean };

/** 勤務パターン一覧の保存前チェック。code が空の行は新規 (呼び出し側で採番) */
export function checkWorkPatterns(v: unknown): Checked<WorkPatternInput[]> {
  if (!Array.isArray(v) || v.length === 0 || v.length > 50) {
    return { ok: false, error: "勤務パターンを1つ以上登録してください" };
  }
  const out: WorkPatternInput[] = [];
  const labels = new Set<string>();
  for (const p of v) {
    if (!isObj(p)) return { ok: false, error: "勤務パターンが読み取れません" };
    const label = typeof p.label === "string" ? p.label.trim() : "";
    if (label === "" || label.length > 20) {
      return { ok: false, error: "勤務パターンの名前を 20 文字以内で入力してください" };
    }
    if (labels.has(label)) return { ok: false, error: `「${label}」が重複しています` };
    labels.add(label);
    if (
      typeof p.start !== "string" ||
      !HHMM.test(p.start) ||
      typeof p.end !== "string" ||
      !HHMM.test(p.end)
    ) {
      return { ok: false, error: `「${label}」の時刻を正しく入力してください` };
    }
    const endsNextDay = p.endsNextDay === true;
    if (!endsNextDay && p.end <= p.start) {
      return {
        ok: false,
        error: `「${label}」は終わりが始まりより後になるようにしてください（日をまたぐなら「翌日」にチェック）`,
      };
    }
    const breakMinutes = p.breakMinutes;
    if (
      !(
        typeof breakMinutes === "number" &&
        Number.isInteger(breakMinutes) &&
        breakMinutes >= 0 &&
        breakMinutes <= 240
      )
    ) {
      return { ok: false, error: `「${label}」の休憩は 0〜240 分で入力してください` };
    }
    out.push({
      code: typeof p.code === "string" ? p.code : "",
      label,
      start: p.start,
      end: p.end,
      endsNextDay,
      breakMinutes,
      isActive: p.isActive !== false,
    });
  }
  if (!out.some((p) => p.isActive))
    return { ok: false, error: "使う勤務パターンを1つ以上残してください" };
  return { ok: true, value: out };
}

export function checkMinWage(v: unknown): Checked<MinWage> {
  if (!isObj(v)) return { ok: false, error: "最低賃金が読み取れません" };
  const prefecture = typeof v.prefecture === "string" ? v.prefecture.trim() : "";
  if (prefecture === "" || prefecture.length > 10)
    return { ok: false, error: "都道府県を入力してください" };
  if (!(typeof v.yen === "number" && Number.isInteger(v.yen) && v.yen >= 500 && v.yen <= 5000)) {
    return { ok: false, error: "最低賃金は 500〜5,000 円で入力してください" };
  }
  if (typeof v.effectiveFrom !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom)) {
    return { ok: false, error: "発効日を入力してください" };
  }
  return { ok: true, value: { prefecture, yen: v.yen, effectiveFrom: v.effectiveFrom } };
}
