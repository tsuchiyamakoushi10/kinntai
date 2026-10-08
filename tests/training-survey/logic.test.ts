import { describe, expect, it } from "vitest";

import {
  type Answers,
  canAnswer,
  checkAnswers,
  checkQuestions,
  checkSurveyDraft,
  formatAnswer,
  OTHER,
  otherKey,
  questionNumbers,
  summarize,
  type SurveyQuestion,
  toEditable,
} from "@/lib/training-survey/logic";

const q = (p: Partial<SurveyQuestion> & Pick<SurveyQuestion, "id" | "kind">): SurveyQuestion => ({
  label: "質問",
  description: "",
  options: [],
  config: {},
  required: true,
  ...p,
});

const questions: SurveyQuestion[] = [
  q({ id: "s1", kind: "SECTION", label: "研修内容について", required: false }),
  q({
    id: "q1",
    kind: "SCALE",
    label: "満足度",
    config: { min: 1, max: 5, minLabel: "不満", maxLabel: "満足" },
  }),
  q({
    id: "q2",
    kind: "SINGLE_CHOICE",
    label: "理解できた？",
    options: ["はい", "いいえ"],
    config: { allowOther: true },
  }),
  q({
    id: "q3",
    kind: "MULTI_CHOICE",
    label: "役立った内容",
    options: ["移乗", "食事", "排泄"],
    required: false,
    config: { allowOther: true },
  }),
  q({ id: "q4", kind: "TEXT", label: "感想", required: false }),
  q({
    id: "q5",
    kind: "GRID",
    label: "講師の評価",
    options: ["よい", "ふつう", "わるい"],
    config: { rows: ["話し方", "資料"] },
  }),
  q({ id: "q6", kind: "DROPDOWN", label: "所属", options: ["デイ", "ショート"], required: false }),
  q({ id: "q7", kind: "DATE", label: "復習した日", required: false }),
  q({ id: "q8", kind: "SCALE", label: "推奨度", config: { min: 0, max: 10 }, required: false }),
];

const draft = {
  title: " 移乗介助研修 ",
  description: "",
  trainedOn: "2026-10-20",
  answerUntil: "2026-10-31",
  trainingType: "COMPANY_PAID",
  officeId: "",
  questions: questions.map((x) => ({ ...x, id: "" })),
  employeeIds: ["e1", "e2", "e1"],
};

describe("アンケート作成の検証", () => {
  it("正しい入力は通り、研修名の空白・対象者の重複を整える", () => {
    const r = checkSurveyDraft(draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("移乗介助研修");
    expect(r.value.employeeIds).toEqual(["e1", "e2"]);
    expect(r.value.questions[0]).toMatchObject({ kind: "SECTION", required: false });
    expect(r.value.questions[5]?.config).toEqual({ rows: ["話し方", "資料"] });
  });
  it("研修名なし・質問なし・期限が研修日より前はエラー", () => {
    expect(checkSurveyDraft({ ...draft, title: " " })).toMatchObject({ ok: false });
    expect(checkSurveyDraft({ ...draft, questions: [] })).toEqual({
      ok: false,
      error: "質問を 1 つ以上作ってください",
    });
    expect(checkSurveyDraft({ ...draft, answerUntil: "2026-10-19" })).toMatchObject({ ok: false });
  });
  it("見出しだけでは作れない", () => {
    expect(checkQuestions([{ kind: "SECTION", label: "見出し" }])).toEqual({
      ok: false,
      error: "答える質問を 1 つ以上作ってください",
    });
  });
  it("エラーの質問番号は見出しを飛ばして数える", () => {
    const r = checkQuestions([
      { kind: "SECTION", label: "見出し" },
      { kind: "SINGLE_CHOICE", label: "Q", options: ["A", " "] },
    ]);
    expect(r).toEqual({ ok: false, error: "質問1の選択肢を 2〜20 個入力してください" });
  });
  it("数の評価は最大 2〜10、表形式は行 1 個以上・列 2 個以上", () => {
    expect(checkQuestions([{ kind: "SCALE", label: "Q", config: { max: 11 } }]).ok).toBe(false);
    expect(
      checkQuestions([{ kind: "GRID", label: "Q", options: ["A", "B"], config: { rows: [] } }]).ok,
    ).toBe(false);
    expect(
      checkQuestions([{ kind: "GRID", label: "Q", options: ["A"], config: { rows: ["r"] } }]).ok,
    ).toBe(false);
  });
  it("「その他」はひとつ選ぶ・いくつでも選ぶにだけ付く", () => {
    const r = checkQuestions([
      { kind: "DROPDOWN", label: "Q", options: ["A", "B"], config: { allowOther: true } },
    ]);
    expect(r.ok && r.value[0]?.config).toEqual({});
  });
});

describe("旧 5 段階評価", () => {
  it("編集画面では数の評価 1〜5 として開く", () => {
    expect(toEditable(q({ id: "r", kind: "RATING_5", options: ["低", "高"] }))).toMatchObject({
      kind: "SCALE",
      options: [],
      config: { min: 1, max: 5, minLabel: "低", maxLabel: "高" },
    });
  });
  it("回答の検証と集計は 1〜5 で動く", () => {
    const old = [q({ id: "r", kind: "RATING_5" })];
    expect(checkAnswers(old, { r: 5 }).ok).toBe(true);
    expect(checkAnswers(old, { r: 6 }).ok).toBe(false);
    expect(summarize(old, [{ employeeName: "架空", answers: { r: 4 } }])[0]).toMatchObject({
      kind: "SCALE",
      average: 4,
      counts: [0, 0, 0, 1, 0],
    });
  });
});

const fullAnswer = {
  q1: 4,
  q2: "はい",
  q5: { 話し方: "よい", 資料: "ふつう" },
};

describe("回答の検証", () => {
  it("正しい回答は通り、複数選択は選択肢の順・その他は最後にそろう", () => {
    const r = checkAnswers(questions, {
      ...fullAnswer,
      q3: [OTHER, "排泄", "移乗"],
      [otherKey("q3")]: " 記録の書き方 ",
      q4: " よかった ",
      q6: "デイ",
      q7: "2026-10-25",
      q8: 0,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        ...fullAnswer,
        q3: ["移乗", "排泄", OTHER],
        "q3.other": "記録の書き方",
        q4: "よかった",
        q6: "デイ",
        q7: "2026-10-25",
        q8: 0,
      },
    });
  });
  it("必須の未回答はエラー (番号は見出しを飛ばす)、任意の未回答は省く", () => {
    expect(checkAnswers(questions, { q2: "はい" })).toEqual({
      ok: false,
      error: "質問1「満足度」に答えてください",
    });
    expect(checkAnswers(questions, { ...fullAnswer, q3: [], q4: "" })).toEqual({
      ok: true,
      value: fullAnswer,
    });
  });
  it("その他を選んだら内容が必要", () => {
    expect(checkAnswers(questions, { ...fullAnswer, q2: OTHER })).toEqual({
      ok: false,
      error: "質問2の「その他」の内容を書いてください",
    });
    expect(checkAnswers(questions, { ...fullAnswer, q2: OTHER, "q2.other": "少し" })).toMatchObject(
      {
        ok: true,
        value: { q2: OTHER, "q2.other": "少し" },
      },
    );
  });
  it("範囲外の評価・存在しない選択肢・表形式の行の不足は弾く", () => {
    expect(checkAnswers(questions, { ...fullAnswer, q1: 6 }).ok).toBe(false);
    expect(checkAnswers(questions, { ...fullAnswer, q8: 11 }).ok).toBe(false);
    expect(checkAnswers(questions, { ...fullAnswer, q2: "たぶん" }).ok).toBe(false);
    expect(checkAnswers(questions, { ...fullAnswer, q6: OTHER }).ok).toBe(false);
    expect(checkAnswers(questions, { ...fullAnswer, q5: { 話し方: "よい" } })).toEqual({
      ok: false,
      error: "質問5「講師の評価」はすべての行に答えてください",
    });
  });
  it("自由記述は 1,000 文字まで、日付は YYYY-MM-DD", () => {
    expect(checkAnswers(questions, { ...fullAnswer, q4: "あ".repeat(1001) }).ok).toBe(false);
    expect(checkAnswers(questions, { ...fullAnswer, q7: "10月25日" }).ok).toBe(false);
  });
});

describe("回答できる期間", () => {
  it("配信中で期限の日の終わりまで", () => {
    expect(canAnswer({ status: "OPEN", answerUntil: "2026-10-31" }, "2026-10-31")).toBe(true);
    expect(canAnswer({ status: "OPEN", answerUntil: "2026-10-31" }, "2026-11-01")).toBe(false);
    expect(canAnswer({ status: "OPEN", answerUntil: null }, "2027-01-01")).toBe(true);
  });
  it("下書き・締め切り後は回答できない", () => {
    expect(canAnswer({ status: "DRAFT", answerUntil: null }, "2026-10-20")).toBe(false);
    expect(canAnswer({ status: "CLOSED", answerUntil: null }, "2026-10-20")).toBe(false);
  });
});

describe("まとめの集計", () => {
  const responses: { employeeName: string; answers: Answers }[] = [
    {
      employeeName: "架空 一郎",
      answers: {
        ...fullAnswer,
        q1: 5,
        q3: ["移乗", OTHER],
        "q3.other": "記録",
        q4: "実践的だった",
        q8: 10,
      },
    },
    {
      employeeName: "架空 花子",
      answers: { ...fullAnswer, q1: 4, q3: ["移乗"], q7: "2026-10-25", q8: 7 },
    },
    {
      employeeName: "架空 次郎",
      answers: { q1: 2, q2: "いいえ", q5: { 話し方: "ふつう", 資料: "ふつう" } },
    },
  ];
  const s = summarize(questions, responses);

  it("見出しは区切りとして残る", () => {
    expect(s[0]).toEqual({
      kind: "SECTION",
      questionId: "s1",
      label: "研修内容について",
      description: "",
    });
  });
  it("数の評価は平均 (小数1桁) と内訳。0〜10 も扱える", () => {
    expect(s[1]).toMatchObject({ answered: 3, average: 3.7, min: 1, counts: [0, 1, 0, 1, 1] });
    expect(s[8]).toMatchObject({ answered: 2, average: 8.5, min: 0 });
    expect((s[8] as { counts: number[] }).counts).toHaveLength(11);
  });
  it("選択式は選択肢ごとの人数と「その他」の内容", () => {
    expect(s[2]).toMatchObject({
      kind: "CHOICE",
      answered: 3,
      counts: [
        { option: "はい", count: 2 },
        { option: "いいえ", count: 1 },
      ],
      other: { count: 0 },
    });
    expect(s[3]).toMatchObject({
      multiple: true,
      answered: 2,
      counts: [
        { option: "移乗", count: 2 },
        { option: "食事", count: 0 },
        { option: "排泄", count: 0 },
      ],
      other: { count: 1, texts: [{ employeeName: "架空 一郎", text: "記録" }] },
    });
    expect(s[6]).toMatchObject({ kind: "CHOICE", other: null });
  });
  it("表形式は行ごとの列の人数", () => {
    expect(s[5]).toMatchObject({
      kind: "GRID",
      answered: 3,
      columns: ["よい", "ふつう", "わるい"],
      rows: [
        { row: "話し方", counts: [2, 1, 0] },
        { row: "資料", counts: [0, 3, 0] },
      ],
    });
  });
  it("自由記述・日付は名前つきで並ぶ", () => {
    expect(s[4]).toMatchObject({
      kind: "TEXTS",
      answered: 1,
      texts: [{ employeeName: "架空 一郎", text: "実践的だった" }],
    });
    expect(s[7]).toMatchObject({ texts: [{ employeeName: "架空 花子", text: "2026年10月25日" }] });
  });
  it("回答 0 件でも落ちない", () => {
    expect(summarize(questions, [])[1]).toMatchObject({ answered: 0, average: null });
  });
});

describe("回答の表示と番号", () => {
  const a: Answers = {
    q1: 4,
    q3: ["移乗", OTHER],
    "q3.other": "記録",
    q5: { 話し方: "よい" },
    q7: "2026-10-25",
  };
  it("評価・その他・表形式・日付を読める形にする", () => {
    expect(formatAnswer(questions[1]!, a)).toBe("4 / 5");
    expect(formatAnswer(questions[3]!, a)).toBe("移乗、その他（記録）");
    expect(formatAnswer(questions[5]!, a)).toBe("話し方：よい\n資料：（未回答）");
    expect(formatAnswer(questions[7]!, a)).toBe("2026年10月25日");
    expect(formatAnswer(questions[4]!, a)).toBe("（未回答）");
  });
  it("番号は見出しを飛ばす", () => {
    expect(questionNumbers(questions).slice(0, 3)).toEqual([null, 1, 2]);
  });
});
