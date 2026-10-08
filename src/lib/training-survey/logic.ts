/**
 * 研修アンケートの検証と集計 (純関数)。docs/training-survey.md §6。
 *
 * DB や画面に依存しないので、管理画面・職員画面・テストのどこからでも使う。
 */

export type QuestionKind = "RATING_5" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT";

export type SurveyQuestion = {
  id: string;
  kind: QuestionKind;
  label: string;
  /** 選択肢。RATING_5 は [低い側の文言, 高い側の文言] (空でもよい) */
  options: ReadonlyArray<string>;
  required: boolean;
};

export type AnswerValue = number | string | string[];
export type Answers = Record<string, AnswerValue>;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  RATING_5: "5段階評価",
  SINGLE_CHOICE: "ひとつ選ぶ",
  MULTI_CHOICE: "いくつでも選ぶ",
  TEXT: "自由記述",
};

export const MAX_TEXT_ANSWER = 1000;
const MAX_QUESTIONS = 30;
const MAX_OPTIONS = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const KINDS: ReadonlyArray<QuestionKind> = ["RATING_5", "SINGLE_CHOICE", "MULTI_CHOICE", "TEXT"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

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

  if (!Array.isArray(v.questions) || v.questions.length === 0) {
    return { ok: false, error: "質問を 1 つ以上作ってください" };
  }
  if (v.questions.length > MAX_QUESTIONS) {
    return { ok: false, error: `質問は ${MAX_QUESTIONS} 個までです` };
  }
  const questions: SurveyQuestion[] = [];
  for (const [i, q] of v.questions.entries()) {
    const n = i + 1;
    if (!isObj(q)) return { ok: false, error: `質問${n}が読み取れません` };
    const kind = KINDS.find((k) => k === q.kind);
    if (!kind) return { ok: false, error: `質問${n}の種類を選んでください` };
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (label === "" || label.length > 200) {
      return { ok: false, error: `質問${n}の文を 200 文字以内で入力してください` };
    }
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    if (!rawOptions.every((o) => typeof o === "string")) {
      return { ok: false, error: `質問${n}の選択肢が読み取れません` };
    }
    let options = (rawOptions as string[]).map((o) => o.trim());
    if (kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE") {
      options = options.filter((o) => o !== "");
      if (options.length < 2 || options.length > MAX_OPTIONS) {
        return { ok: false, error: `質問${n}の選択肢を 2〜${MAX_OPTIONS} 個入力してください` };
      }
      if (new Set(options).size !== options.length) {
        return { ok: false, error: `質問${n}の選択肢に同じものがあります` };
      }
      if (options.some((o) => o.length > 100)) {
        return { ok: false, error: `質問${n}の選択肢は 100 文字以内にしてください` };
      }
    } else if (kind === "RATING_5") {
      options = [options[0] ?? "", options[1] ?? ""].map((o) => o.slice(0, 30));
    } else {
      options = [];
    }
    questions.push({
      id: typeof q.id === "string" ? q.id : "",
      kind,
      label,
      options,
      required: q.required !== false,
    });
  }

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
      questions,
      employeeIds,
    },
  };
}

/** 職員の回答を検証する。答えていない任意の質問は結果に含めない。 */
export function checkAnswers(
  questions: ReadonlyArray<SurveyQuestion>,
  raw: unknown,
): Checked<Answers> {
  if (!isObj(raw)) return { ok: false, error: "回答が読み取れません" };
  const out: Answers = {};
  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    const v = raw[q.id];
    const missing = () =>
      q.required ? ({ ok: false, error: `質問${n}「${q.label}」に答えてください` } as const) : null;

    switch (q.kind) {
      case "RATING_5": {
        if (v === undefined || v === null || v === "") {
          const m = missing();
          if (m) return m;
          continue;
        }
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) {
          return { ok: false, error: `質問${n}は 1〜5 で答えてください` };
        }
        out[q.id] = v;
        break;
      }
      case "SINGLE_CHOICE": {
        if (v === undefined || v === null || v === "") {
          const m = missing();
          if (m) return m;
          continue;
        }
        if (typeof v !== "string" || !q.options.includes(v)) {
          return { ok: false, error: `質問${n}の選択肢が正しくありません` };
        }
        out[q.id] = v;
        break;
      }
      case "MULTI_CHOICE": {
        const arr = v === undefined || v === null ? [] : v;
        if (
          !Array.isArray(arr) ||
          !arr.every((x) => typeof x === "string" && q.options.includes(x))
        ) {
          return { ok: false, error: `質問${n}の選択肢が正しくありません` };
        }
        if (arr.length === 0) {
          const m = missing();
          if (m) return m;
          continue;
        }
        // 選択肢の並び順にそろえる
        out[q.id] = q.options.filter((o) => (arr as string[]).includes(o));
        break;
      }
      case "TEXT": {
        const s = typeof v === "string" ? v.trim() : "";
        if (s === "") {
          const m = missing();
          if (m) return m;
          continue;
        }
        if (s.length > MAX_TEXT_ANSWER) {
          return { ok: false, error: `質問${n}は ${MAX_TEXT_ANSWER} 文字以内にしてください` };
        }
        out[q.id] = s;
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

export type QuestionSummary =
  | {
      kind: "RATING_5";
      questionId: string;
      label: string;
      answered: number;
      average: number | null;
      /** 1〜5 の人数 (index 0 = 1 点) */
      counts: [number, number, number, number, number];
      lowLabel: string;
      highLabel: string;
    }
  | {
      kind: "SINGLE_CHOICE" | "MULTI_CHOICE";
      questionId: string;
      label: string;
      answered: number;
      counts: ReadonlyArray<{ option: string; count: number }>;
    }
  | {
      kind: "TEXT";
      questionId: string;
      label: string;
      answered: number;
      texts: ReadonlyArray<{ employeeName: string; text: string }>;
    };

/** まとめ画面の集計。responses は回答済みの人だけ渡す。 */
export function summarize(
  questions: ReadonlyArray<SurveyQuestion>,
  responses: ReadonlyArray<{ employeeName: string; answers: Answers }>,
): QuestionSummary[] {
  return questions.map((q) => {
    const values = responses
      .map((r) => ({ name: r.employeeName, v: r.answers[q.id] }))
      .filter((x) => x.v !== undefined);
    switch (q.kind) {
      case "RATING_5": {
        const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
        let sum = 0;
        let n = 0;
        for (const { v } of values) {
          if (typeof v === "number" && v >= 1 && v <= 5) {
            counts[v - 1] = (counts[v - 1] ?? 0) + 1;
            sum += v;
            n += 1;
          }
        }
        return {
          kind: "RATING_5",
          questionId: q.id,
          label: q.label,
          answered: n,
          average: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
          counts,
          lowLabel: q.options[0] ?? "",
          highLabel: q.options[1] ?? "",
        };
      }
      case "SINGLE_CHOICE":
      case "MULTI_CHOICE": {
        const counts = q.options.map((option) => ({
          option,
          count: values.filter(({ v }) => (Array.isArray(v) ? v.includes(option) : v === option))
            .length,
        }));
        return { kind: q.kind, questionId: q.id, label: q.label, answered: values.length, counts };
      }
      case "TEXT": {
        const texts = values
          .filter(({ v }) => typeof v === "string" && v !== "")
          .map(({ name, v }) => ({ employeeName: name, text: v as string }));
        return { kind: "TEXT", questionId: q.id, label: q.label, answered: texts.length, texts };
      }
    }
  });
}

/** 個別表示・一覧で使う、回答の読みやすい文字列 */
export function formatAnswer(q: SurveyQuestion, v: AnswerValue | undefined): string {
  if (v === undefined) return "（未回答）";
  if (q.kind === "RATING_5" && typeof v === "number") return `${v} / 5`;
  if (Array.isArray(v)) return v.length > 0 ? v.join("、") : "（未回答）";
  return String(v);
}
