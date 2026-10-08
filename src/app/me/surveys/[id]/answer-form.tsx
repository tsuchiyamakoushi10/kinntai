"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  type Answers,
  formatAnswer,
  MAX_SHORT_TEXT_ANSWER,
  MAX_TEXT_ANSWER,
  OTHER,
  otherKey,
  questionNumbers,
  scaleOf,
  type SurveyQuestion,
} from "@/lib/training-survey/logic";

import { submitSurveyAnswer } from "../actions";

type Props = {
  surveyId: string;
  questions: SurveyQuestion[];
  initial: Answers | null;
  /** 受付中か (false なら回答を表示するだけ) */
  open: boolean;
};

const choiceBtn = (on: boolean) =>
  `rounded-xl px-4 py-3 text-left text-base font-semibold ${
    on ? "bg-sky-600 text-white" : "border-2 border-slate-300 bg-white text-slate-800"
  }`;

export function AnswerForm({ surveyId, questions, initial, open }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial ?? {});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const numbers = questionNumbers(questions);
  const set = (key: string, v: Answers[string] | undefined) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });

  if (done) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-4xl" aria-hidden>
          ✓
        </p>
        <p className="text-lg font-bold text-slate-900">送信しました。ありがとうございました。</p>
        <Link
          href="/me"
          className="rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white"
        >
          ホームに戻る
        </Link>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="flex flex-col gap-3">
        <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          このアンケートの受付は終わりました。{initial ? "あなたの回答は次のとおりです。" : ""}
        </p>
        {initial &&
          questions.map((q, i) =>
            q.kind === "SECTION" ? (
              <h2
                key={q.id}
                className="mt-2 border-l-4 border-sky-600 pl-2 text-base font-bold text-slate-900"
              >
                {q.label}
              </h2>
            ) : (
              <div key={q.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-500">
                  {numbers[i]}. {q.label}
                </p>
                <p className="mt-1 font-semibold whitespace-pre-wrap text-slate-900">
                  {formatAnswer(q, initial)}
                </p>
              </div>
            ),
          )}
      </section>
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await submitSurveyAnswer(surveyId, answers);
      if (r.ok) {
        setDone(true);
        window.scrollTo({ top: 0 });
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {initial && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          回答済みです。直して送り直せます。
        </p>
      )}
      {questions.map((q, i) => {
        if (q.kind === "SECTION") {
          return (
            <div key={q.id} className="mt-2 flex flex-col gap-1 border-l-4 border-sky-600 pl-3">
              <h2 className="text-lg font-bold text-slate-900">{q.label}</h2>
              {q.description && (
                <p className="text-sm whitespace-pre-wrap text-slate-600">{q.description}</p>
              )}
            </div>
          );
        }
        return (
          <fieldset key={q.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <legend className="sr-only">{q.label}</legend>
            <div>
              <p className="text-base font-bold text-slate-900">
                {numbers[i]}. {q.label}
                {q.required ? (
                  <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                    必須
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-normal text-slate-500">（任意）</span>
                )}
              </p>
              {q.description && (
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{q.description}</p>
              )}
            </div>
            <QuestionInput q={q} answers={answers} set={set} />
          </fieldset>
        );
      })}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white disabled:bg-slate-400"
      >
        {pending ? "送信中…" : initial ? "直して送信する" : "送信する"}
      </button>
    </form>
  );
}

function QuestionInput({
  q,
  answers,
  set,
}: {
  q: SurveyQuestion;
  answers: Answers;
  set: (key: string, v: Answers[string] | undefined) => void;
}) {
  const v = answers[q.id];
  const other =
    typeof answers[otherKey(q.id)] === "string" ? (answers[otherKey(q.id)] as string) : "";
  const otherInput = (
    <input
      aria-label="その他の内容"
      value={other}
      maxLength={MAX_SHORT_TEXT_ANSWER}
      onChange={(e) => set(otherKey(q.id), e.target.value)}
      placeholder="その他の内容を書いてください"
      className="rounded-xl border-2 border-sky-300 p-3 text-base"
    />
  );

  switch (q.kind) {
    case "SCALE":
    case "RATING_5": {
      const s = scaleOf(q);
      const values = Array.from({ length: s.max - s.min + 1 }, (_, k) => s.min + k);
      const cols = values.length <= 6 ? values.length : 6;
      return (
        <div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {values.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={v === n}
                onClick={() => set(q.id, n)}
                className={`h-14 rounded-xl text-xl font-bold ${
                  v === n
                    ? "bg-sky-600 text-white"
                    : "border-2 border-slate-300 bg-white text-slate-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {(s.minLabel || s.maxLabel) && (
            <div className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
              <span>{s.minLabel && `${s.min} = ${s.minLabel}`}</span>
              <span className="text-right">{s.maxLabel && `${s.max} = ${s.maxLabel}`}</span>
            </div>
          )}
        </div>
      );
    }
    case "SINGLE_CHOICE":
      return (
        <>
          {q.options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={v === o}
              onClick={() => set(q.id, o)}
              className={choiceBtn(v === o)}
            >
              {v === o ? "● " : "○ "}
              {o}
            </button>
          ))}
          {q.config.allowOther && (
            <>
              <button
                type="button"
                aria-pressed={v === OTHER}
                onClick={() => set(q.id, OTHER)}
                className={choiceBtn(v === OTHER)}
              >
                {v === OTHER ? "● " : "○ "}その他
              </button>
              {v === OTHER && otherInput}
            </>
          )}
        </>
      );
    case "MULTI_CHOICE": {
      const cur = Array.isArray(v) ? v : [];
      const toggle = (o: string) =>
        set(q.id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
      return (
        <>
          <p className="-mt-1 text-xs text-slate-500">あてはまるものをすべて選んでください</p>
          {q.options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={cur.includes(o)}
              onClick={() => toggle(o)}
              className={choiceBtn(cur.includes(o))}
            >
              {cur.includes(o) ? "☑ " : "☐ "}
              {o}
            </button>
          ))}
          {q.config.allowOther && (
            <>
              <button
                type="button"
                aria-pressed={cur.includes(OTHER)}
                onClick={() => toggle(OTHER)}
                className={choiceBtn(cur.includes(OTHER))}
              >
                {cur.includes(OTHER) ? "☑ " : "☐ "}その他
              </button>
              {cur.includes(OTHER) && otherInput}
            </>
          )}
        </>
      );
    }
    case "DROPDOWN":
      return (
        <select
          aria-label={q.label}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => set(q.id, e.target.value === "" ? undefined : e.target.value)}
          className="rounded-xl border-2 border-slate-300 bg-white p-3 text-base"
        >
          <option value="">選んでください</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "GRID": {
      const cur = v !== undefined && typeof v === "object" && !Array.isArray(v) ? v : {};
      return (
        <div className="flex flex-col gap-3">
          {(q.config.rows ?? []).map((row) => (
            <div key={row} className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-slate-800">{row}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((col) => {
                  const on = cur[row] === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${row}：${col}`}
                      onClick={() => set(q.id, { ...cur, [row]: col })}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        on
                          ? "bg-sky-600 text-white"
                          : "border-2 border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "DATE":
      return (
        <input
          type="date"
          aria-label={q.label}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => set(q.id, e.target.value === "" ? undefined : e.target.value)}
          className="rounded-xl border-2 border-slate-300 p-3 text-base"
        />
      );
    case "SHORT_TEXT":
      return (
        <input
          aria-label={q.label}
          value={typeof v === "string" ? v : ""}
          maxLength={MAX_SHORT_TEXT_ANSWER}
          onChange={(e) => set(q.id, e.target.value)}
          className="rounded-xl border-2 border-slate-300 p-3 text-base"
        />
      );
    case "TEXT":
      return (
        <textarea
          aria-label={q.label}
          rows={4}
          maxLength={MAX_TEXT_ANSWER}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => set(q.id, e.target.value)}
          className="rounded-xl border-2 border-slate-300 p-3 text-base"
        />
      );
    case "SECTION":
      return null;
  }
}
