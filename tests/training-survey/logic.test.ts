import { describe, expect, it } from "vitest";

import {
  type Answers,
  canAnswer,
  checkAnswers,
  checkSurveyDraft,
  formatAnswer,
  summarize,
  type SurveyQuestion,
} from "@/lib/training-survey/logic";

const questions: SurveyQuestion[] = [
  { id: "q1", kind: "RATING_5", label: "研修の満足度", options: ["不満", "満足"], required: true },
  {
    id: "q2",
    kind: "SINGLE_CHOICE",
    label: "理解できた？",
    options: ["はい", "いいえ"],
    required: true,
  },
  {
    id: "q3",
    kind: "MULTI_CHOICE",
    label: "役立った内容",
    options: ["移乗", "食事", "排泄"],
    required: false,
  },
  { id: "q4", kind: "TEXT", label: "感想", options: [], required: false },
];

const draft = {
  title: " 移乗介助研修 ",
  description: "",
  trainedOn: "2026-10-20",
  answerUntil: "2026-10-31",
  trainingType: "COMPANY_PAID",
  officeId: "",
  questions: questions.map((q) => ({ ...q, id: "" })),
  employeeIds: ["e1", "e2", "e1"],
};

describe("アンケート作成の検証", () => {
  it("正しい入力は通り、研修名の空白・対象者の重複を整える", () => {
    const r = checkSurveyDraft(draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("移乗介助研修");
    expect(r.value.employeeIds).toEqual(["e1", "e2"]);
    expect(r.value.officeId).toBeNull();
    expect(r.value.questions[3]?.options).toEqual([]);
  });
  it("研修名なし・質問なし・期限が研修日より前はエラー", () => {
    expect(checkSurveyDraft({ ...draft, title: " " })).toMatchObject({ ok: false });
    expect(checkSurveyDraft({ ...draft, questions: [] })).toEqual({
      ok: false,
      error: "質問を 1 つ以上作ってください",
    });
    expect(checkSurveyDraft({ ...draft, answerUntil: "2026-10-19" })).toMatchObject({ ok: false });
  });
  it("選択式は選択肢 2 個以上・重複なし (空欄は無視)", () => {
    const one = {
      ...draft,
      questions: [{ kind: "SINGLE_CHOICE", label: "Q", options: ["A", " "] }],
    };
    expect(checkSurveyDraft(one)).toEqual({
      ok: false,
      error: "質問1の選択肢を 2〜10 個入力してください",
    });
    const dup = {
      ...draft,
      questions: [{ kind: "MULTI_CHOICE", label: "Q", options: ["A", "A"] }],
    };
    expect(checkSurveyDraft(dup)).toMatchObject({ ok: false });
  });
});

describe("回答の検証", () => {
  it("正しい回答は通り、複数選択は選択肢の順にそろう", () => {
    const r = checkAnswers(questions, {
      q1: 4,
      q2: "はい",
      q3: ["排泄", "移乗"],
      q4: " よかった ",
    });
    expect(r).toEqual({
      ok: true,
      value: { q1: 4, q2: "はい", q3: ["移乗", "排泄"], q4: "よかった" },
    });
  });
  it("必須の未回答はエラー、任意の未回答は省く", () => {
    expect(checkAnswers(questions, { q2: "はい" })).toEqual({
      ok: false,
      error: "質問1「研修の満足度」に答えてください",
    });
    expect(checkAnswers(questions, { q1: 3, q2: "いいえ", q3: [], q4: "" })).toEqual({
      ok: true,
      value: { q1: 3, q2: "いいえ" },
    });
  });
  it("範囲外の評価・存在しない選択肢は弾く", () => {
    expect(checkAnswers(questions, { q1: 6, q2: "はい" }).ok).toBe(false);
    expect(checkAnswers(questions, { q1: 3, q2: "たぶん" }).ok).toBe(false);
    expect(checkAnswers(questions, { q1: 3, q2: "はい", q3: ["睡眠"] }).ok).toBe(false);
  });
  it("自由記述は 1,000 文字まで", () => {
    expect(checkAnswers(questions, { q1: 3, q2: "はい", q4: "あ".repeat(1001) }).ok).toBe(false);
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
      answers: { q1: 5, q2: "はい", q3: ["移乗", "食事"], q4: "実践的だった" },
    },
    { employeeName: "架空 花子", answers: { q1: 4, q2: "はい", q3: ["移乗"] } },
    { employeeName: "架空 次郎", answers: { q1: 2, q2: "いいえ" } },
  ];
  const s = summarize(questions, responses);

  it("5段階評価は平均 (小数1桁) と内訳", () => {
    expect(s[0]).toMatchObject({ answered: 3, average: 3.7, counts: [0, 1, 0, 1, 1] });
  });
  it("選択式は選択肢ごとの人数", () => {
    expect(s[1]).toMatchObject({
      answered: 3,
      counts: [
        { option: "はい", count: 2 },
        { option: "いいえ", count: 1 },
      ],
    });
    expect(s[2]).toMatchObject({
      answered: 2,
      counts: [
        { option: "移乗", count: 2 },
        { option: "食事", count: 1 },
        { option: "排泄", count: 0 },
      ],
    });
  });
  it("自由記述は名前つきで並ぶ", () => {
    expect(s[3]).toMatchObject({
      answered: 1,
      texts: [{ employeeName: "架空 一郎", text: "実践的だった" }],
    });
  });
  it("回答 0 件でも落ちない", () => {
    expect(summarize(questions, [])[0]).toMatchObject({ answered: 0, average: null });
  });
});

describe("回答の表示", () => {
  it("評価は「4 / 5」、複数選択は読点区切り、未回答は明示", () => {
    expect(formatAnswer(questions[0]!, 4)).toBe("4 / 5");
    expect(formatAnswer(questions[2]!, ["移乗", "食事"])).toBe("移乗、食事");
    expect(formatAnswer(questions[3]!, undefined)).toBe("（未回答）");
  });
});
