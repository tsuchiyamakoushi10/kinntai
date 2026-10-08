/**
 * 研修アンケートの検証と集計 (純関数)。docs/training-survey.md §2, §6。
 *
 * DB や画面に依存しないので、管理画面・職員画面・テストのどこからでも使う。
 */

export type QuestionKind =
  | "SECTION"
  | "SHORT_TEXT"
  | "TEXT"
  | "SINGLE_CHOICE"
  | "DROPDOWN"
  | "MULTI_CHOICE"
  | "SCALE"
  | "DATE"
  | "GRID"
  /** 旧 5 段階評価。新規作成では SCALE を使う */
  | "RATING_5";

export type QuestionConfig = {
  /** SCALE: 最小 (0 か 1) */
  min?: number;
  /** SCALE: 最大 (2〜10) */
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** GRID: 行 (評価する項目) */
  rows?: string[];
  /** SINGLE_CHOICE / MULTI_CHOICE: 「その他（自由記述）」を付ける */
  allowOther?: boolean;
};

export type SurveyQuestion = {
  id: string;
  kind: QuestionKind;
  label: string;
  /** 補足説明 (空文字 = なし) */
  description: string;
  /** 選択式の選択肢、表形式の列。RATING_5 は [低い側の文言, 高い側の文言] */
  options: ReadonlyArray<string>;
  config: QuestionConfig;
  required: boolean;
};

export type AnswerValue = number | string | string[] | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** 「その他」を選んだときの値。書いた文字は answers[otherKey(id)] に入れる */
export const OTHER = "__other__";
export const otherKey = (questionId: string): string => `${questionId}.other`;

/** 新規作成で選べる種類 (表示順) */
export const CREATABLE_KINDS: ReadonlyArray<QuestionKind> = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "DROPDOWN",
  "SCALE",
  "GRID",
  "SHORT_TEXT",
  "TEXT",
  "DATE",
  "SECTION",
];

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  SECTION: "見出し・説明",
  SHORT_TEXT: "一行の答え",
  TEXT: "自由記述（長文）",
  SINGLE_CHOICE: "ひとつ選ぶ",
  DROPDOWN: "プルダウン",
  MULTI_CHOICE: "いくつでも選ぶ",
  SCALE: "数の評価",
  DATE: "日付",
  GRID: "表形式",
  RATING_5: "5段階評価",
};

export const MAX_TEXT_ANSWER = 1000;
export const MAX_SHORT_TEXT_ANSWER = 200;
const MAX_QUESTIONS = 50;
const MAX_OPTIONS = 20;
const MAX_GRID_ROWS = 20;
const MAX_GRID_COLUMNS = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const ALL_KINDS: ReadonlyArray<QuestionKind> = [...CREATABLE_KINDS, "RATING_5"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export const isAnswerable = (q: Pick<SurveyQuestion, "kind">): boolean => q.kind !== "SECTION";
export const isChoice = (kind: QuestionKind): boolean =>
  kind === "SINGLE_CHOICE" || kind === "DROPDOWN" || kind === "MULTI_CHOICE";
export const canHaveOther = (kind: QuestionKind): boolean =>
  kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE";

/** 数の評価の範囲。旧 RATING_5 は 1〜5 として扱う */
export function scaleOf(q: Pick<SurveyQuestion, "kind" | "options" | "config">): {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
} {
  if (q.kind === "RATING_5") {
    return { min: 1, max: 5, minLabel: q.options[0] ?? "", maxLabel: q.options[1] ?? "" };
  }
  const min = q.config.min === 0 ? 0 : 1;
  const max = Math.min(10, Math.max(2, Math.trunc(q.config.max ?? 5)));
  return { min, max, minLabel: q.config.minLabel ?? "", maxLabel: q.config.maxLabel ?? "" };
}

/** 見出しを飛ばした質問番号 (見出しは null) */
export function questionNumbers(
  questions: ReadonlyArray<Pick<SurveyQuestion, "kind">>,
): (number | null)[] {
  let n = 0;
  return questions.map((q) => (isAnswerable(q) ? (n += 1) : null));
}

/** 編集画面で開くときの形にそろえる (旧 RATING_5 → SCALE 1〜5) */
export function toEditable(q: SurveyQuestion): SurveyQuestion {
  if (q.kind !== "RATING_5") return q;
  return {
    ...q,
    kind: "SCALE",
    options: [],
    config: { min: 1, max: 5, minLabel: q.options[0] ?? "", maxLabel: q.options[1] ?? "" },
  };
}

function cleanList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim())
    : [];
}

/** 質問一式の検証 (作成画面・ひな形の両方で使う)。id は文字列ならそのまま残す */
export function checkQuestions(v: unknown): Checked<SurveyQuestion[]> {
  if (!Array.isArray(v) || v.length === 0) {
    return { ok: false, error: "質問を 1 つ以上作ってください" };
  }
  if (v.length > MAX_QUESTIONS) return { ok: false, error: `質問は ${MAX_QUESTIONS} 個までです` };
  const nums = questionNumbers(
    v.map((q) => ({ kind: (isObj(q) ? q.kind : "TEXT") as QuestionKind })),
  );
  const out: SurveyQuestion[] = [];

  for (const [i, q] of v.entries()) {
    const name = nums[i] !== null ? `質問${nums[i]}` : `${i + 1}番目の見出し`;
    if (!isObj(q)) return { ok: false, error: `${name}が読み取れません` };
    const kind = ALL_KINDS.find((k) => k === q.kind);
    if (!kind) return { ok: false, error: `${name}の種類を選んでください` };
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (label === "" || label.length > 200) {
      return { ok: false, error: `${name}の文を 200 文字以内で入力してください` };
    }
    const description = typeof q.description === "string" ? q.description.trim() : "";
    if (description.length > 1000) {
      return { ok: false, error: `${name}の説明は 1,000 文字以内にしてください` };
    }
    const rawConfig = isObj(q.config) ? q.config : {};
    let options: string[] = [];
    let config: QuestionConfig = {};

    if (isChoice(kind)) {
      options = cleanList(q.options).filter((o) => o !== "");
      if (options.length < 2 || options.length > MAX_OPTIONS) {
        return { ok: false, error: `${name}の選択肢を 2〜${MAX_OPTIONS} 個入力してください` };
      }
      if (new Set(options).size !== options.length) {
        return { ok: false, error: `${name}の選択肢に同じものがあります` };
      }
      if (options.some((o) => o.length > 100 || o === OTHER)) {
        return { ok: false, error: `${name}の選択肢は 100 文字以内にしてください` };
      }
      if (canHaveOther(kind) && rawConfig.allowOther === true) config = { allowOther: true };
    } else if (kind === "SCALE") {
      const min = rawConfig.min === 0 ? 0 : 1;
      const max = typeof rawConfig.max === "number" ? Math.trunc(rawConfig.max) : 5;
      if (max < 2 || max > 10) return { ok: false, error: `${name}の最大は 2〜10 にしてください` };
      config = {
        min,
        max,
        minLabel: str(rawConfig.minLabel, 30),
        maxLabel: str(rawConfig.maxLabel, 30),
      };
    } else if (kind === "GRID") {
      const rows = cleanList(rawConfig.rows).filter((r) => r !== "");
      options = cleanList(q.options).filter((o) => o !== "");
      if (rows.length < 1 || rows.length > MAX_GRID_ROWS) {
        return {
          ok: false,
          error: `${name}の行（評価する項目）を 1〜${MAX_GRID_ROWS} 個入力してください`,
        };
      }
      if (options.length < 2 || options.length > MAX_GRID_COLUMNS) {
        return {
          ok: false,
          error: `${name}の列（選ぶ答え）を 2〜${MAX_GRID_COLUMNS} 個入力してください`,
        };
      }
      if (new Set(rows).size !== rows.length || new Set(options).size !== options.length) {
        return { ok: false, error: `${name}の行か列に同じものがあります` };
      }
      if ([...rows, ...options].some((x) => x.length > 100)) {
        return { ok: false, error: `${name}の行・列は 100 文字以内にしてください` };
      }
      config = { rows };
    } else if (kind === "RATING_5") {
      const raw = cleanList(q.options);
      options = [str(raw[0], 30), str(raw[1], 30)];
    }

    out.push({
      id: typeof q.id === "string" ? q.id : "",
      kind,
      label,
      description,
      options,
      config,
      required: kind === "SECTION" ? false : q.required !== false,
    });
  }
  if (!out.some(isAnswerable)) return { ok: false, error: "答える質問を 1 つ以上作ってください" };
  return { ok: true, value: out };
}

export type SurveyDraft = {
  title: string;
  description: string;
  trainedOn: string;
  answerUntil: string | null;
  trainingType: "COMPANY_PAID" | "PAID_SELF";
  officeId: string | null;
  /** id は既存の質問なら DB の id、新しい質問は空文字 */
  questions: SurveyQuestion[];
  employeeIds: string[];
};

/** 作成画面の入力を検証する。 */
export function checkSurveyDraft(v: unknown): Checked<SurveyDraft> {
  if (!isObj(v)) return { ok: false, error: "入力が読み取れません" };
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (title === "" || title.length > 100) {
    return { ok: false, error: "研修名を 100 文字以内で入力してください" };
  }
  const description = typeof v.description === "string" ? v.description.trim() : "";
  if (description.length > 1000) return { ok: false, error: "説明は 1,000 文字以内にしてください" };
  if (typeof v.trainedOn !== "string" || !YMD.test(v.trainedOn)) {
    return { ok: false, error: "研修日を入力してください" };
  }
  const answerUntil =
    typeof v.answerUntil === "string" && v.answerUntil !== "" ? v.answerUntil : null;
  if (answerUntil !== null && !YMD.test(answerUntil)) {
    return { ok: false, error: "回答期限を正しく入力してください" };
  }
  if (answerUntil !== null && answerUntil < v.trainedOn) {
    return { ok: false, error: "回答期限は研修日以降にしてください" };
  }
  const trainingType = v.trainingType === "PAID_SELF" ? "PAID_SELF" : "COMPANY_PAID";
  const officeId = typeof v.officeId === "string" && v.officeId !== "" ? v.officeId : null;
  const questions = checkQuestions(v.questions);
  if (!questions.ok) return questions;
  const employeeIds = Array.isArray(v.employeeIds)
    ? [...new Set(v.employeeIds.filter((x): x is string => typeof x === "string"))]
    : [];

  return {
    ok: true,
    value: {
      title,
      description,
      trainedOn: v.trainedOn,
      answerUntil,
      trainingType,
      officeId,
      questions: questions.value,
      employeeIds,
    },
  };
}

function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (isObj(v) && Object.keys(v).length === 0)
  );
}

/** 職員の回答を検証する。答えていない任意の質問は結果に含めない。 */
export function checkAnswers(
  questions: ReadonlyArray<SurveyQuestion>,
  raw: unknown,
): Checked<Answers> {
  if (!isObj(raw)) return { ok: false, error: "回答が読み取れません" };
  const out: Answers = {};
  const nums = questionNumbers(questions);

  for (const [i, q] of questions.entries()) {
    if (!isAnswerable(q)) continue;
    const name = `質問${nums[i]}`;
    const required = { ok: false as const, error: `${name}「${q.label}」に答えてください` };
    const v = raw[q.id];
    if (isEmpty(v)) {
      if (q.required) return required;
      continue;
    }
    const bad = (msg = `${name}の答えが正しくありません`) => ({ ok: false as const, error: msg });
    const allowOther = canHaveOther(q.kind) && q.config.allowOther === true;
    const otherText = str(raw[otherKey(q.id)], MAX_SHORT_TEXT_ANSWER);

    switch (q.kind) {
      case "SCALE":
      case "RATING_5": {
        const { min, max } = scaleOf(q);
        if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
          return bad(`${name}は ${min}〜${max} で答えてください`);
        }
        out[q.id] = v;
        break;
      }
      case "SINGLE_CHOICE":
      case "DROPDOWN": {
        if (typeof v !== "string") return bad();
        if (v === OTHER && allowOther) {
          if (otherText === "") return bad(`${name}の「その他」の内容を書いてください`);
          out[q.id] = OTHER;
          out[otherKey(q.id)] = otherText;
        } else if (q.options.includes(v)) {
          out[q.id] = v;
        } else {
          return bad();
        }
        break;
      }
      case "MULTI_CHOICE": {
        if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return bad();
        const picked = v as string[];
        if (picked.some((x) => !(q.options.includes(x) || (x === OTHER && allowOther)))) {
          return bad();
        }
        const ordered = q.options.filter((o) => picked.includes(o));
        if (picked.includes(OTHER)) {
          if (otherText === "") return bad(`${name}の「その他」の内容を書いてください`);
          ordered.push(OTHER);
          out[otherKey(q.id)] = otherText;
        }
        out[q.id] = ordered;
        break;
      }
      case "SHORT_TEXT":
      case "TEXT": {
        const max = q.kind === "TEXT" ? MAX_TEXT_ANSWER : MAX_SHORT_TEXT_ANSWER;
        if (typeof v !== "string") return bad();
        const s = v.trim();
        if (s === "") {
          if (q.required) return required;
          continue;
        }
        if (s.length > max) return bad(`${name}は ${max} 文字以内にしてください`);
        out[q.id] = s;
        break;
      }
      case "DATE": {
        if (typeof v !== "string" || !YMD.test(v)) {
          return bad(`${name}の日付を正しく入力してください`);
        }
        out[q.id] = v;
        break;
      }
      case "GRID": {
        if (!isObj(v)) return bad();
        const rows = q.config.rows ?? [];
        const picked: Record<string, string> = {};
        for (const [row, col] of Object.entries(v)) {
          if (!rows.includes(row) || typeof col !== "string" || !q.options.includes(col)) {
            return bad();
          }
          picked[row] = col;
        }
        if (q.required && rows.some((r) => picked[r] === undefined)) {
          return bad(`${name}「${q.label}」はすべての行に答えてください`);
        }
        if (Object.keys(picked).length > 0) out[q.id] = picked;
        break;
      }
    }
  }
  return { ok: true, value: out };
}

/** 回答を受け付けるか。期限は JST の日付で、その日の終わりまで。 */
export function canAnswer(
  survey: { status: "DRAFT" | "OPEN" | "CLOSED"; answerUntil: string | null },
  todayJst: string,
): boolean {
  if (survey.status !== "OPEN") return false;
  return survey.answerUntil === null || todayJst <= survey.answerUntil;
}

type Named = { employeeName: string; text: string };

export type QuestionSummary =
  | { kind: "SECTION"; questionId: string; label: string; description: string }
  | {
      kind: "SCALE";
      questionId: string;
      label: string;
      answered: number;
      average: number | null;
      min: number;
      /** min から順に各数字の人数 */
      counts: number[];
      minLabel: string;
      maxLabel: string;
    }
  | {
      kind: "CHOICE";
      multiple: boolean;
      questionId: string;
      label: string;
      answered: number;
      counts: ReadonlyArray<{ option: string; count: number }>;
      /** 「その他」がある場合だけ */
      other: { count: number; texts: ReadonlyArray<Named> } | null;
    }
  | {
      kind: "GRID";
      questionId: string;
      label: string;
      answered: number;
      columns: ReadonlyArray<string>;
      rows: ReadonlyArray<{ row: string; counts: number[] }>;
    }
  | {
      kind: "TEXTS";
      questionId: string;
      label: string;
      answered: number;
      texts: ReadonlyArray<Named>;
    };

/** まとめ画面の集計。responses は回答済みの人だけ渡す。 */
export function summarize(
  questions: ReadonlyArray<SurveyQuestion>,
  responses: ReadonlyArray<{ employeeName: string; answers: Answers }>,
): QuestionSummary[] {
  return questions.map((q): QuestionSummary => {
    const values = responses
      .map((r) => ({ name: r.employeeName, v: r.answers[q.id], other: r.answers[otherKey(q.id)] }))
      .filter((x) => x.v !== undefined);
    const base = { questionId: q.id, label: q.label };

    switch (q.kind) {
      case "SECTION":
        return { kind: "SECTION", ...base, description: q.description };
      case "SCALE":
      case "RATING_5": {
        const { min, max, minLabel, maxLabel } = scaleOf(q);
        const counts = Array.from({ length: max - min + 1 }, () => 0);
        let sum = 0;
        let n = 0;
        for (const { v } of values) {
          if (typeof v === "number" && v >= min && v <= max) {
            counts[v - min] = (counts[v - min] ?? 0) + 1;
            sum += v;
            n += 1;
          }
        }
        return {
          kind: "SCALE",
          ...base,
          answered: n,
          average: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
          min,
          counts,
          minLabel,
          maxLabel,
        };
      }
      case "SINGLE_CHOICE":
      case "DROPDOWN":
      case "MULTI_CHOICE": {
        const has = (v: AnswerValue | undefined, o: string) =>
          Array.isArray(v) ? v.includes(o) : v === o;
        const counts = q.options.map((option) => ({
          option,
          count: values.filter(({ v }) => has(v, option)).length,
        }));
        const otherRows = values.filter(({ v }) => has(v, OTHER));
        const other =
          canHaveOther(q.kind) && q.config.allowOther
            ? {
                count: otherRows.length,
                texts: otherRows.map(({ name, other: t }) => ({
                  employeeName: name,
                  text: typeof t === "string" ? t : "",
                })),
              }
            : null;
        return {
          kind: "CHOICE",
          ...base,
          multiple: q.kind === "MULTI_CHOICE",
          answered: values.length,
          counts,
          other,
        };
      }
      case "GRID": {
        const rows = (q.config.rows ?? []).map((row) => ({
          row,
          counts: q.options.map(
            (col) =>
              values.filter(({ v }) => isObj(v) && (v as Record<string, string>)[row] === col)
                .length,
          ),
        }));
        return { kind: "GRID", ...base, answered: values.length, columns: q.options, rows };
      }
      case "SHORT_TEXT":
      case "TEXT":
      case "DATE": {
        const texts = values
          .filter(({ v }) => typeof v === "string" && v !== "")
          .map(({ name, v }) => ({
            employeeName: name,
            text: q.kind === "DATE" ? formatYmd(v as string) : (v as string),
          }));
        return { kind: "TEXTS", ...base, answered: texts.length, texts };
      }
    }
  });
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 個別表示などで使う、回答の読みやすい文字列 */
export function formatAnswer(q: SurveyQuestion, answers: Answers): string {
  const v = answers[q.id];
  if (v === undefined) return "（未回答）";
  const otherText = answers[otherKey(q.id)];
  const label = (x: string) =>
    x === OTHER ? `その他（${typeof otherText === "string" ? otherText : ""}）` : x;
  if ((q.kind === "SCALE" || q.kind === "RATING_5") && typeof v === "number") {
    return `${v} / ${scaleOf(q).max}`;
  }
  if (q.kind === "DATE" && typeof v === "string") return formatYmd(v);
  if (Array.isArray(v)) return v.length > 0 ? v.map(label).join("、") : "（未回答）";
  if (isObj(v)) {
    return (q.config.rows ?? [])
      .map((r) => `${r}：${(v as Record<string, string>)[r] ?? "（未回答）"}`)
      .join("\n");
  }
  return label(String(v));
}
