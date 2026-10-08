"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  QUESTION_KIND_LABEL,
  type QuestionKind,
  type SurveyDraft,
} from "@/lib/training-survey/logic";

import { saveTrainingSurvey } from "./actions";

export type EditorOffice = {
  id: string;
  name: string;
  employees: ReadonlyArray<{ id: string; name: string }>;
};

type EditableQuestion = {
  key: string;
  kind: QuestionKind;
  label: string;
  options: string[];
  required: boolean;
};

type Props = {
  surveyId: string | null;
  initial: SurveyDraft;
  offices: ReadonlyArray<EditorOffice>;
  /** 回答がある場合は質問を変えられない */
  questionsLocked: boolean;
  /** 回答済みの人は対象から外せない */
  respondedEmployeeIds: ReadonlyArray<string>;
};

const KINDS: ReadonlyArray<QuestionKind> = ["RATING_5", "SINGLE_CHOICE", "MULTI_CHOICE", "TEXT"];

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";
const subBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

let keySeq = 0;
const newKey = () => `q${(keySeq += 1)}`;

function defaultOptions(kind: QuestionKind): string[] {
  if (kind === "RATING_5") return ["よくなかった", "とてもよかった"];
  if (kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE") return ["", ""];
  return [];
}

export function SurveyEditor(props: Props) {
  const router = useRouter();
  const d = props.initial;
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description);
  const [trainedOn, setTrainedOn] = useState(d.trainedOn);
  const [answerUntil, setAnswerUntil] = useState(d.answerUntil ?? "");
  const [trainingType, setTrainingType] = useState(d.trainingType);
  const [officeId, setOfficeId] = useState(d.officeId ?? "");
  const [questions, setQuestions] = useState<EditableQuestion[]>(() =>
    d.questions.map((q) => ({
      key: newKey(),
      kind: q.kind,
      label: q.label,
      options: [...q.options],
      required: q.required,
    })),
  );
  const [targets, setTargets] = useState<Set<string>>(() => new Set(d.employeeIds));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = props.questionsLocked;
  const responded = new Set(props.respondedEmployeeIds);

  const setQ = (i: number, patch: Partial<EditableQuestion>) =>
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const moveQ = (i: number, delta: -1 | 1) =>
    setQuestions((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function toggleEmployee(id: string, on: boolean) {
    if (!on && responded.has(id)) return;
    setTargets((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleOffice(o: EditorOffice, on: boolean) {
    setTargets((prev) => {
      const next = new Set(prev);
      for (const e of o.employees) {
        if (on) next.add(e.id);
        else if (!responded.has(e.id)) next.delete(e.id);
      }
      return next;
    });
  }

  function save() {
    setMessage(null);
    start(async () => {
      const r = await saveTrainingSurvey(props.surveyId, {
        title,
        description,
        trainedOn,
        answerUntil,
        trainingType,
        officeId,
        questions: questions.map((q) => ({ ...q, id: "" })),
        employeeIds: [...targets],
      });
      if (!r.ok) return setMessage(r.error);
      router.push(`/admin/training-surveys/${r.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">研修</h2>
        <Field label="研修名">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 移乗介助の研修"
            className={inputCls}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="研修日">
            <input
              type="date"
              value={trainedOn}
              onChange={(e) => setTrainedOn(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="回答の期限（空欄なら締め切るまで）">
            <input
              type="date"
              value={answerUntil}
              onChange={(e) => setAnswerUntil(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="研修の費用">
            <select
              value={trainingType}
              onChange={(e) =>
                setTrainingType(e.target.value === "PAID_SELF" ? "PAID_SELF" : "COMPANY_PAID")
              }
              className={inputCls}
            >
              <option value="COMPANY_PAID">会社負担</option>
              <option value="PAID_SELF">本人負担</option>
            </select>
          </Field>
        </div>
        <Field label="職員に見せる説明（任意）">
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
          />
        </Field>
        <p className="text-xs text-slate-500">
          回答した職員には、この研修名と研修日で研修記録が自動で付きます。
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">質問</h2>
        {locked && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            すでに回答があるため、質問は変更できません。
          </p>
        )}
        {questions.map((q, i) => (
          <div key={q.key} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-700">質問{i + 1}</span>
              <select
                value={q.kind}
                disabled={locked}
                onChange={(e) => {
                  const kind = e.target.value as QuestionKind;
                  setQ(i, { kind, options: defaultOptions(kind) });
                }}
                className={inputCls}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {QUESTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={q.required}
                  disabled={locked}
                  onChange={(e) => setQ(i, { required: e.target.checked })}
                  className="size-5"
                />
                必ず答える
              </label>
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => moveQ(i, -1)}
                  className={subBtn}
                  aria-label="上へ"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => moveQ(i, 1)}
                  className={subBtn}
                  aria-label="下へ"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                  className={`${subBtn} text-red-700`}
                >
                  削除
                </button>
              </span>
            </div>
            <input
              aria-label={`質問${i + 1}の文`}
              value={q.label}
              disabled={locked}
              onChange={(e) => setQ(i, { label: e.target.value })}
              placeholder="質問の文（例: 研修の内容はわかりやすかったですか？）"
              className={inputCls}
            />
            {q.kind === "RATING_5" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="1 の意味">
                  <input
                    value={q.options[0] ?? ""}
                    disabled={locked}
                    onChange={(e) => setQ(i, { options: [e.target.value, q.options[1] ?? ""] })}
                    className={inputCls}
                  />
                </Field>
                <Field label="5 の意味">
                  <input
                    value={q.options[1] ?? ""}
                    disabled={locked}
                    onChange={(e) => setQ(i, { options: [q.options[0] ?? "", e.target.value] })}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
            {(q.kind === "SINGLE_CHOICE" || q.kind === "MULTI_CHOICE") && (
              <div className="flex flex-col gap-2">
                {q.options.map((o, k) => (
                  <div key={k} className="flex gap-2">
                    <input
                      aria-label={`選択肢${k + 1}`}
                      value={o}
                      disabled={locked}
                      placeholder={`選択肢${k + 1}`}
                      onChange={(e) =>
                        setQ(i, {
                          options: q.options.map((x, m) => (m === k ? e.target.value : x)),
                        })
                      }
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      type="button"
                      disabled={locked || q.options.length <= 2}
                      onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })}
                      className={subBtn}
                      aria-label={`選択肢${k + 1}を削除`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={locked || q.options.length >= 10}
                  onClick={() => setQ(i, { options: [...q.options, ""] })}
                  className={`${subBtn} w-fit`}
                >
                  ＋ 選択肢を追加
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={locked}
              onClick={() =>
                setQuestions((prev) => [
                  ...prev,
                  {
                    key: newKey(),
                    kind: k,
                    label: "",
                    options: defaultOptions(k),
                    required: k !== "TEXT",
                  },
                ])
              }
              className={subBtn}
            >
              ＋ {QUESTION_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">
          配る相手 <span className="text-sm font-normal text-slate-500">（{targets.size}人）</span>
        </h2>
        <Field label="主な拠点（一覧の絞り込み用・任意）">
          <select
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className={inputCls}
          >
            <option value="">指定しない</option>
            {props.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        {props.offices.map((o) => {
          const all = o.employees.length > 0 && o.employees.every((e) => targets.has(e.id));
          return (
            <details
              key={o.id}
              className="rounded-lg border border-slate-200 p-3"
              open={o.employees.some((e) => targets.has(e.id))}
            >
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                {o.name}
                <span className="text-xs font-normal text-slate-500">
                  {o.employees.filter((e) => targets.has(e.id)).length} / {o.employees.length}人
                </span>
              </summary>
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(e) => toggleOffice(o, e.target.checked)}
                  className="size-5"
                />
                この拠点の全員
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {o.employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={targets.has(e.id)}
                      disabled={responded.has(e.id)}
                      onChange={(ev) => toggleEmployee(e.id, ev.target.checked)}
                      className="size-5"
                    />
                    {e.name}
                    {responded.has(e.id) && (
                      <span className="text-xs text-emerald-700">回答済み</span>
                    )}
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {pending ? "保存中…" : "保存する"}
        </button>
        {message && (
          <span role="alert" className="text-sm font-medium text-red-700">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
