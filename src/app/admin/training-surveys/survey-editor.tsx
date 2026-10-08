"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  canHaveOther,
  CREATABLE_KINDS,
  isChoice,
  QUESTION_KIND_LABEL,
  questionNumbers,
  type QuestionConfig,
  type QuestionKind,
  type SurveyDraft,
  toEditable,
} from "@/lib/training-survey/logic";

import { saveSurveyTemplate, saveTrainingSurvey } from "./actions";

export type EditorOffice = {
  id: string;
  name: string;
  employees: ReadonlyArray<{ id: string; name: string }>;
};

type EditableQuestion = {
  key: string;
  kind: QuestionKind;
  label: string;
  description: string;
  /** 説明欄を開いているか */
  showDescription: boolean;
  options: string[];
  config: QuestionConfig;
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

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";
const subBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

let keySeq = 0;
const newKey = () => `q${(keySeq += 1)}`;

function blank(kind: QuestionKind): EditableQuestion {
  return {
    key: newKey(),
    kind,
    label: "",
    description: "",
    showDescription: kind === "SECTION",
    options: isChoice(kind) ? ["", ""] : kind === "GRID" ? ["よい", "ふつう", "よくない"] : [],
    config:
      kind === "SCALE"
        ? { min: 1, max: 5, minLabel: "よくなかった", maxLabel: "とてもよかった" }
        : kind === "GRID"
          ? { rows: ["", ""] }
          : {},
    required: kind !== "SECTION" && kind !== "TEXT",
  };
}

/** 種類を変えたとき、入力済みの選択肢などをできるだけ引き継ぐ */
function changeKind(q: EditableQuestion, kind: QuestionKind): EditableQuestion {
  const fresh = blank(kind);
  const keepOptions =
    (isChoice(q.kind) || q.kind === "GRID") && (isChoice(kind) || kind === "GRID");
  return {
    ...q,
    kind,
    options: keepOptions ? q.options : fresh.options,
    config:
      kind === "GRID"
        ? { rows: q.config.rows ?? fresh.config.rows }
        : kind === "SCALE"
          ? q.kind === "SCALE"
            ? q.config
            : fresh.config
          : canHaveOther(kind) && q.config.allowOther
            ? { allowOther: true }
            : {},
    required: kind === "SECTION" ? false : q.required,
    showDescription: q.showDescription || kind === "SECTION",
  };
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
    d.questions.map(toEditable).map((q) => ({
      key: newKey(),
      kind: q.kind,
      label: q.label,
      description: q.description,
      showDescription: q.description !== "" || q.kind === "SECTION",
      options: [...q.options],
      config: q.config,
      required: q.required,
    })),
  );
  const [targets, setTargets] = useState<Set<string>>(() => new Set(d.employeeIds));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = props.questionsLocked;
  const responded = new Set(props.respondedEmployeeIds);
  const numbers = questionNumbers(questions);

  const setQ = (i: number, patch: Partial<EditableQuestion>) =>
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const insertAt = (i: number, kind: QuestionKind) =>
    setQuestions((prev) => [...prev.slice(0, i), blank(kind), ...prev.slice(i)]);
  const duplicate = (i: number) =>
    setQuestions((prev) => {
      const src = prev[i]!;
      const copy = { ...src, key: newKey(), options: [...src.options], config: { ...src.config } };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  const move = (from: number, to: number) =>
    setQuestions((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  // ---- ドラッグで並べ替え (マウス・指の両方。つまみを持って上下に動かす) ----
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, over: index });
  }
  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const y = e.clientY;
    // 指の位置より下にある最初のカードの手前に入れる。どれより下なら最後に入れる
    let over = questions.length;
    for (let i = 0; i < questions.length; i += 1) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        over = i;
        break;
      }
    }
    // 下へ動かすときは自分の分だけ詰める
    const target = over > drag.from ? over - 1 : over;
    if (target !== drag.over) setDrag({ ...drag, over: target });
    // 画面の端に来たらスクロールする
    if (y < 80) window.scrollBy(0, -12);
    else if (y > window.innerHeight - 80) window.scrollBy(0, 12);
  }
  function onHandleUp() {
    if (drag) move(drag.from, drag.over);
    setDrag(null);
  }

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

  const payloadQuestions = () =>
    questions.map((q) => ({
      id: "",
      kind: q.kind,
      label: q.label,
      description: q.showDescription ? q.description : "",
      options: q.options,
      config: q.config,
      required: q.required,
    }));

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
        questions: payloadQuestions(),
        employeeIds: [...targets],
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      router.push(`/admin/training-surveys/${r.id}`);
      router.refresh();
    });
  }

  function saveTemplate() {
    const name = window.prompt("ひな形の名前（例: 研修の感想）", title);
    if (name === null) return;
    setMessage(null);
    start(async () => {
      const r = await saveSurveyTemplate(name, payloadQuestions());
      setMessage(
        r.ok
          ? { ok: true, text: `ひな形「${name.trim()}」を保存しました。` }
          : { ok: false, text: r.error },
      );
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

      <section className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <h2 className="text-base font-bold text-slate-900">質問</h2>
          {!locked && (
            <button type="button" onClick={saveTemplate} disabled={pending} className={subBtn}>
              この質問をひな形として保存
            </button>
          )}
        </div>
        {locked && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            すでに回答があるため、質問は変更できません。
          </p>
        )}
        {!locked && <InsertBar onPick={(k) => insertAt(0, k)} />}
        {questions.map((q, i) => (
          <div key={q.key} className="flex flex-col gap-1">
            {drag && drag.over === i && drag.from > i && <DropLine />}
            <div
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`flex gap-2 rounded-xl border bg-white p-3 ${
                q.kind === "SECTION"
                  ? "border-l-4 border-slate-300 border-l-sky-600"
                  : "border-slate-200"
              } ${drag?.from === i ? "opacity-50 ring-2 ring-sky-400" : ""}`}
            >
              <button
                type="button"
                aria-label={`${numbers[i] ? `質問${numbers[i]}` : "見出し"}をドラッグして並べ替え`}
                disabled={locked}
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") move(i, i - 1);
                  if (e.key === "ArrowDown") move(i, i + 1);
                }}
                className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-xl text-slate-400 select-none hover:bg-slate-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
              >
                ⠿
              </button>
              <QuestionCard
                q={q}
                number={numbers[i] ?? null}
                locked={locked}
                onChange={(patch) => setQ(i, patch)}
                onKind={(k) => setQ(i, changeKind(q, k))}
                onDuplicate={() => duplicate(i)}
                onDelete={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>
            {drag && drag.over === i && drag.from < i && <DropLine />}
            {!locked && <InsertBar onPick={(k) => insertAt(i + 1, k)} />}
          </div>
        ))}
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
            {props.offices
              .filter((o) => o.id !== "")
              .map((o) => (
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
              key={o.id || "none"}
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
          <span
            role={message.ok ? "status" : "alert"}
            className={`text-sm font-medium ${message.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function DropLine() {
  return <div aria-hidden className="h-1 rounded-full bg-sky-500" />;
}

/** カードとカードの間の「＋ ここに追加」 */
function InsertBar({ onPick }: { onPick: (kind: QuestionKind) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="group flex items-center gap-2 py-0.5">
        <span className="h-px flex-1 bg-transparent group-hover:bg-slate-200" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-500 hover:border-slate-500 hover:text-slate-800"
        >
          ＋ ここに追加
        </button>
        <span className="h-px flex-1 bg-transparent group-hover:bg-slate-200" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-400 bg-slate-50 p-3">
      <span className="text-xs font-semibold text-slate-600">追加する種類：</span>
      {CREATABLE_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            onPick(k);
            setOpen(false);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-100"
        >
          {QUESTION_KIND_LABEL[k]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ml-auto text-sm text-slate-500 hover:underline"
      >
        やめる
      </button>
    </div>
  );
}

function QuestionCard({
  q,
  number,
  locked,
  onChange,
  onKind,
  onDuplicate,
  onDelete,
}: {
  q: EditableQuestion;
  number: number | null;
  locked: boolean;
  onChange: (patch: Partial<EditableQuestion>) => void;
  onKind: (kind: QuestionKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isSection = q.kind === "SECTION";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-700">
          {isSection ? "見出し" : `質問${number}`}
        </span>
        <select
          aria-label="質問の種類"
          value={q.kind}
          disabled={locked}
          onChange={(e) => onKind(e.target.value as QuestionKind)}
          className={`${inputCls} py-1.5 text-sm`}
        >
          {CREATABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {QUESTION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {!isSection && (
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={q.required}
              disabled={locked}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="size-5"
            />
            必ず答える
          </label>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" disabled={locked} onClick={onDuplicate} className={subBtn}>
            複製
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={onDelete}
            className={`${subBtn} text-red-700`}
          >
            削除
          </button>
        </span>
      </div>

      <input
        aria-label={isSection ? "見出しの文" : `質問${number}の文`}
        value={q.label}
        disabled={locked}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder={
          isSection
            ? "見出し（例: 講師について）"
            : "質問の文（例: 研修の内容はわかりやすかったですか？）"
        }
        className={`${inputCls} ${isSection ? "text-lg font-bold" : ""}`}
      />
      {q.showDescription ? (
        <textarea
          aria-label="説明"
          rows={2}
          value={q.description}
          disabled={locked}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="説明（任意。質問の下に小さく表示されます）"
          className={`${inputCls} text-sm`}
        />
      ) : (
        !locked && (
          <button
            type="button"
            onClick={() => onChange({ showDescription: true })}
            className="w-fit text-xs font-semibold text-sky-700 hover:underline"
          >
            ＋ 説明を追加
          </button>
        )
      )}

      {isChoice(q.kind) && (
        <ListEditor
          label="選択肢"
          items={q.options}
          min={2}
          max={20}
          locked={locked}
          marker={q.kind === "MULTI_CHOICE" ? "☐" : q.kind === "DROPDOWN" ? "▾" : "○"}
          onChange={(options) => onChange({ options })}
          footer={
            canHaveOther(q.kind) && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.config.allowOther === true}
                  disabled={locked}
                  onChange={(e) =>
                    onChange({ config: e.target.checked ? { allowOther: true } : {} })
                  }
                  className="size-5"
                />
                「その他（自由記述）」を付ける
              </label>
            )
          }
        />
      )}

      {q.kind === "SCALE" && <ScaleEditor q={q} locked={locked} onChange={onChange} />}

      {q.kind === "GRID" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ListEditor
            label="行（評価する項目）"
            items={q.config.rows ?? []}
            min={1}
            max={20}
            locked={locked}
            marker="・"
            onChange={(rows) => onChange({ config: { rows } })}
          />
          <ListEditor
            label="列（選ぶ答え）"
            items={q.options}
            min={2}
            max={10}
            locked={locked}
            marker="○"
            onChange={(options) => onChange({ options })}
          />
        </div>
      )}

      {(q.kind === "SHORT_TEXT" || q.kind === "TEXT" || q.kind === "DATE") && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-400">
          {q.kind === "DATE"
            ? "回答者が日付を選びます"
            : q.kind === "TEXT"
              ? "回答者が文章を書きます（長文）"
              : "回答者が一行で書きます"}
        </p>
      )}
    </div>
  );
}

function ScaleEditor({
  q,
  locked,
  onChange,
}: {
  q: EditableQuestion;
  locked: boolean;
  onChange: (patch: Partial<EditableQuestion>) => void;
}) {
  const min = q.config.min === 0 ? 0 : 1;
  const max = q.config.max ?? 5;
  const set = (patch: Partial<QuestionConfig>) => onChange({ config: { ...q.config, ...patch } });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="最小"
          value={min}
          disabled={locked}
          onChange={(e) => set({ min: Number(e.target.value) })}
          className={`${inputCls} py-1.5`}
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
        </select>
        から
        <select
          aria-label="最大"
          value={max}
          disabled={locked}
          onChange={(e) => set({ max: Number(e.target.value) })}
          className={`${inputCls} py-1.5`}
        >
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        まで
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`${min} の意味（任意）`}>
          <input
            value={q.config.minLabel ?? ""}
            disabled={locked}
            onChange={(e) => set({ minLabel: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label={`${max} の意味（任意）`}>
          <input
            value={q.config.maxLabel ?? ""}
            disabled={locked}
            onChange={(e) => set({ maxLabel: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  );
}

/** 選択肢・行・列の編集 (追加・削除・↑↓) */
function ListEditor({
  label,
  items,
  min,
  max,
  locked,
  marker,
  onChange,
  footer,
}: {
  label: string;
  items: ReadonlyArray<string>;
  min: number;
  max: number;
  locked: boolean;
  marker: string;
  onChange: (items: string[]) => void;
  footer?: React.ReactNode;
}) {
  const list = [...items];
  const swap = (a: number, b: number) => {
    if (b < 0 || b >= list.length) return;
    [list[a], list[b]] = [list[b]!, list[a]!];
    onChange(list);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {list.map((o, k) => (
        <div key={k} className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 text-center text-slate-400">
            {marker}
          </span>
          <input
            aria-label={`${label}${k + 1}`}
            value={o}
            disabled={locked}
            placeholder={`${label}${k + 1}`}
            onChange={(e) => onChange(list.map((x, m) => (m === k ? e.target.value : x)))}
            onKeyDown={(e) => {
              // Enter で次の行を追加 (Google フォームと同じ操作感)
              if (e.key === "Enter" && !e.nativeEvent.isComposing && list.length < max) {
                e.preventDefault();
                onChange([...list.slice(0, k + 1), "", ...list.slice(k + 1)]);
              }
            }}
            className={`${inputCls} min-w-0 flex-1 py-1.5`}
          />
          <button
            type="button"
            disabled={locked || k === 0}
            onClick={() => swap(k, k - 1)}
            className={`${subBtn} px-2 py-1.5`}
            aria-label="上へ"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={locked || k === list.length - 1}
            onClick={() => swap(k, k + 1)}
            className={`${subBtn} px-2 py-1.5`}
            aria-label="下へ"
          >
            ↓
          </button>
          <button
            type="button"
            disabled={locked || list.length <= min}
            onClick={() => onChange(list.filter((_, m) => m !== k))}
            className={`${subBtn} px-2 py-1.5`}
            aria-label={`${label}${k + 1}を削除`}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={locked || list.length >= max}
          onClick={() => onChange([...list, ""])}
          className={`${subBtn} w-fit py-1.5`}
        >
          ＋ {label}を追加
        </button>
        {footer}
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
