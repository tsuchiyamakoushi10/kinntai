"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { formatAnswer, type Answers, type SurveyQuestion } from "@/lib/training-survey/logic";

import { submitSurveyAnswer } from "../actions";

type Props = {
  surveyId: string;
  questions: SurveyQuestion[];
  initial: Answers | null;
  /** 受付中か (false なら回答を表示するだけ) */
  open: boolean;
};

export function AnswerForm({ surveyId, questions, initial, open }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial ?? {});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (id: string, v: Answers[string]) => setAnswers((prev) => ({ ...prev, [id]: v }));

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
          questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">
                {i + 1}. {q.label}
              </p>
              <p className="mt-1 font-semibold whitespace-pre-wrap text-slate-900">
                {formatAnswer(q, initial[q.id])}
              </p>
            </div>
          ))}
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
      {questions.map((q, i) => (
        <fieldset key={q.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <legend className="sr-only">{q.label}</legend>
          <p className="text-base font-bold text-slate-900">
            {i + 1}. {q.label}
            {q.required ? (
              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                必須
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal text-slate-500">（任意）</span>
            )}
          </p>

          {q.kind === "RATING_5" && (
            <div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = answers[q.id] === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set(q.id, v)}
                      className={`h-14 rounded-xl text-xl font-bold ${
                        on
                          ? "bg-sky-600 text-white"
                          : "border-2 border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              {(q.options[0] || q.options[1]) && (
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>1 = {q.options[0]}</span>
                  <span>5 = {q.options[1]}</span>
                </div>
              )}
            </div>
          )}

          {q.kind === "SINGLE_CHOICE" &&
            q.options.map((o) => {
              const on = answers[q.id] === o;
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(q.id, o)}
                  className={`rounded-xl px-4 py-3 text-left text-base font-semibold ${
                    on
                      ? "bg-sky-600 text-white"
                      : "border-2 border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  {on ? "● " : "○ "}
                  {o}
                </button>
              );
            })}

          {q.kind === "MULTI_CHOICE" && (
            <>
              <p className="-mt-1 text-xs text-slate-500">あてはまるものをすべて選んでください</p>
              {q.options.map((o) => {
                const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                const on = cur.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(q.id, on ? cur.filter((x) => x !== o) : [...cur, o])}
                    className={`rounded-xl px-4 py-3 text-left text-base font-semibold ${
                      on
                        ? "bg-sky-600 text-white"
                        : "border-2 border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {on ? "☑ " : "☐ "}
                    {o}
                  </button>
                );
              })}
            </>
          )}

          {q.kind === "TEXT" && (
            <textarea
              rows={4}
              maxLength={1000}
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => set(q.id, e.target.value)}
              className="rounded-xl border-2 border-slate-300 p-3 text-base"
            />
          )}
        </fieldset>
      ))}

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
