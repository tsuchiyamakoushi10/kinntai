"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EMPLOYMENT_TYPE_LABEL, QUALIFICATION_LABEL } from "@/lib/labor-notice/constants";
import { PRESET_TEXT_LABEL, type WorkPatternInput } from "@/lib/labor-notice/masters";
import type {
  AllowanceRow,
  MinWage,
  NoticeEmploymentType,
  NoticePreset,
  PresetTexts,
  QualificationAllowances,
} from "@/lib/labor-notice/types";

import {
  addMinWage,
  deleteMinWage,
  resetNoticePreset,
  saveNoticePreset,
  saveNoticeWorkPatterns,
  type SettingsResult,
} from "./actions";

type Props = {
  presets: Record<NoticeEmploymentType, NoticePreset>;
  patterns: WorkPatternInput[];
  minWages: MinWage[];
  savedPresets: NoticeEmploymentType[];
};

const TYPES: ReadonlyArray<NoticeEmploymentType> = ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"];
const TEXT_KEYS = Object.keys(PRESET_TEXT_LABEL) as (keyof PresetTexts)[];
const QUAL_KEYS: ReadonlyArray<keyof QualificationAllowances> = [
  "CARE_WORKER",
  "INITIAL_TRAINING",
  "NURSE",
  "ASSISTANT_NURSE",
];
/** 空欄にすると書面からその行が消える項目 */
const OPTIONAL_TEXTS: ReadonlyArray<keyof PresetTexts> = ["trialPeriod", "holidayWork"];

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";
const primaryBtn =
  "rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400";
const subBtn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function SettingsEditor(props: Props) {
  const [tab, setTab] = useState<"presets" | "patterns" | "minWages">("presets");
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex flex-wrap gap-2">
        {(
          [
            ["presets", "区分ごとの初期値・手当"],
            ["patterns", "勤務パターン"],
            ["minWages", "最低賃金"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "presets" && (
        <PresetsSection
          presets={props.presets}
          patterns={props.patterns}
          saved={props.savedPresets}
        />
      )}
      {/* 保存後の再読込で新しい値から作り直す (新規行の二重登録を防ぐ) */}
      {tab === "patterns" && (
        <PatternsSection key={JSON.stringify(props.patterns)} patterns={props.patterns} />
      )}
      {tab === "minWages" && <MinWagesSection minWages={props.minWages} />}
    </div>
  );
}

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<SettingsResult>, okText = "保存しました。") => {
    setMessage(null);
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  };
  return { pending, message, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <span
      role={message.ok ? "status" : "alert"}
      className={`text-sm font-medium ${message.ok ? "text-emerald-700" : "text-red-700"}`}
    >
      {message.text}
    </span>
  );
}

// ---------------- 区分ごとの初期値 ----------------

function PresetsSection({
  presets,
  patterns,
  saved,
}: {
  presets: Props["presets"];
  patterns: WorkPatternInput[];
  saved: NoticeEmploymentType[];
}) {
  const [type, setType] = useState<NoticeEmploymentType>("FULL_TIME");
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`rounded-lg border px-3 py-2.5 text-base font-semibold ${
              type === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
            }`}
          >
            {EMPLOYMENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {/* key で区分ごとにフォームを作り直す (切替時に入力途中の値を持ち越さない) */}
      <PresetForm
        key={`${type}:${JSON.stringify(presets[type])}:${isSavedKey(saved, type)}`}
        type={type}
        initial={presets[type]}
        patterns={patterns}
        isSaved={saved.includes(type)}
      />
    </section>
  );
}

function PresetForm({
  type,
  initial,
  patterns,
  isSaved,
}: {
  type: NoticeEmploymentType;
  initial: NoticePreset;
  patterns: WorkPatternInput[];
  isSaved: boolean;
}) {
  const [texts, setTexts] = useState<PresetTexts>(initial.texts);
  const [months, setMonths] = useState<number | null>(initial.defaultFixedTermMonths);
  const [converts, setConverts] = useState(initial.convertsToIndefinite);
  const [patternCodes, setPatternCodes] = useState<string[]>([...initial.defaultPatternCodes]);
  const [rows, setRows] = useState<AllowanceRow[]>([...initial.allowanceRows]);
  const [quals, setQuals] = useState<QualificationAllowances>(initial.qualificationAllowances);
  const { pending, message, run } = useSave();
  const hasQualification = type !== "NIGHT_ONLY";

  const setRow = (i: number, patch: Partial<AllowanceRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moveRow = (i: number, d: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function save() {
    run(() =>
      saveNoticePreset(type, {
        texts,
        defaultFixedTermMonths: months,
        convertsToIndefinite: converts,
        defaultPatternCodes: patternCodes,
        allowanceRows: rows,
        qualificationAllowances: quals,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold text-slate-900">契約期間</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-slate-600">最初に選ぶ期間</span>
            <select
              value={months === null ? "none" : "fixed"}
              onChange={(e) => setMonths(e.target.value === "none" ? null : (months ?? 6))}
              className={inputCls}
            >
              <option value="none">期間の定めなし</option>
              <option value="fixed">期間あり</option>
            </select>
          </label>
          {months !== null && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-slate-600">何か月</span>
              <input
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className={`${inputCls} w-24`}
              />
            </label>
          )}
        </div>
        {months !== null && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={converts}
              onChange={(e) => setConverts(e.target.checked)}
              className="size-5"
            />
            期間が終わったら「期間の定めなし」に切り替える
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold text-slate-900">
          最初に選ぶ勤務パターン
        </legend>
        <div className="flex flex-wrap gap-2">
          {patterns
            .filter((p) => p.isActive)
            .map((p) => {
              const on = patternCodes.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPatternCodes((prev) =>
                      on ? prev.filter((c) => c !== p.code) : [...prev, p.code],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="col-span-full mb-2 text-base font-semibold text-slate-900">
          書面の文言
        </legend>
        {TEXT_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-slate-600">
              {PRESET_TEXT_LABEL[key]}
              {OPTIONAL_TEXTS.includes(key) && "（空欄なら書面に出しません）"}
            </span>
            <textarea
              rows={2}
              value={texts[key] ?? ""}
              onChange={(e) => setTexts((prev) => ({ ...prev, [key]: e.target.value }))}
              className={inputCls}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold text-slate-900">書面に載せる手当</legend>
        <p className="text-xs text-slate-500">
          基本給・資格手当・ひとり親手当・管理者手当・相談員手当は、通知書を作るときに金額から自動で載ります。ここには、それ以外の決まった手当を書きます。
        </p>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[12rem_1fr_auto]"
          >
            <input
              aria-label="手当の名前"
              placeholder="手当の名前（例: 夜勤手当）"
              value={r.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
              className={inputCls}
            />
            <input
              aria-label="金額・計算方法"
              placeholder="金額・計算方法（例: 1回 6,000円 × 夜勤回数）"
              value={r.body}
              onChange={(e) => setRow(i, { body: e.target.value })}
              className={inputCls}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveRow(i, -1)}
                className={subBtn}
                aria-label="上へ"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveRow(i, 1)}
                className={subBtn}
                aria-label="下へ"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                className={`${subBtn} text-red-700`}
              >
                削除
              </button>
            </div>
            {type === "PART_TIME" && (
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input
                  type="checkbox"
                  checked={r.onlyIfWorksNight === true}
                  onChange={(e) => setRow(i, { onlyIfWorksNight: e.target.checked || undefined })}
                  className="size-5"
                />
                夜勤に入る人のときだけ載せる
              </label>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { label: "", body: "" }])}
          className={`${subBtn} w-fit`}
        >
          ＋ 手当を追加
        </button>
      </fieldset>

      {hasQualification && (
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="col-span-full mb-2 text-base font-semibold text-slate-900">
            資格手当（月額）
          </legend>
          <p className="col-span-full text-xs text-slate-500">
            空欄にすると、その資格の人の通知書を作るときに金額を入力してもらいます。
          </p>
          {QUAL_KEYS.map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">{QUALIFICATION_LABEL[k]}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={quals[k] ?? ""}
                onChange={(e) =>
                  setQuals((prev) => ({
                    ...prev,
                    [k]:
                      e.target.value === ""
                        ? null
                        : Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                  }))
                }
                className={inputCls}
              />
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
          {pending ? "保存中…" : `${EMPLOYMENT_TYPE_LABEL[type]}の設定を保存`}
        </button>
        {isSaved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(`${EMPLOYMENT_TYPE_LABEL[type]}の設定を最初の状態に戻しますか？`)
              ) {
                run(() => resetNoticePreset(type), "最初の状態に戻しました。");
              }
            }}
            className={subBtn}
          >
            最初の状態に戻す
          </button>
        )}
        <Message message={message} />
      </div>
    </div>
  );
}

function isSavedKey(saved: NoticeEmploymentType[], type: NoticeEmploymentType): string {
  return saved.includes(type) ? "saved" : "default";
}

// ---------------- 勤務パターン ----------------

function PatternsSection({ patterns }: { patterns: WorkPatternInput[] }) {
  const [rows, setRows] = useState<WorkPatternInput[]>(patterns);
  const { pending, message, run } = useSave();
  const setRow = (i: number, patch: Partial<WorkPatternInput>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        通知書の「勤務パターン」の表に載る時間です。勤務表の記号とは別です（夜勤は入りから明けまでを1行で書きます）。使わなくなったものは「使う」のチェックを外してください。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="px-2 py-1">名前</th>
              <th className="px-2 py-1">始まり</th>
              <th className="px-2 py-1">終わり</th>
              <th className="px-2 py-1">翌日に終わる</th>
              <th className="px-2 py-1">休憩（分）</th>
              <th className="px-2 py-1">使う</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.code || `new-${i}`}
                className={`border-t border-slate-100 ${r.isActive ? "" : "opacity-50"}`}
              >
                <td className="px-2 py-1.5">
                  <input
                    aria-label="名前"
                    value={r.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                    className={`${inputCls} w-32`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="time"
                    aria-label="始まり"
                    value={r.start}
                    onChange={(e) => setRow(i, { start: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="time"
                    aria-label="終わり"
                    value={r.end}
                    onChange={(e) => setRow(i, { end: e.target.value })}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label="翌日に終わる"
                    checked={r.endsNextDay}
                    onChange={(e) => setRow(i, { endsNextDay: e.target.checked })}
                    className="size-5"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    max={240}
                    step={5}
                    aria-label="休憩（分）"
                    value={r.breakMinutes}
                    onChange={(e) =>
                      setRow(i, { breakMinutes: Number.parseInt(e.target.value, 10) || 0 })
                    }
                    className={`${inputCls} w-24`}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label="使う"
                    checked={r.isActive}
                    onChange={(e) => setRow(i, { isActive: e.target.checked })}
                    className="size-5"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                code: "",
                label: "",
                start: "09:00",
                end: "18:00",
                endsNextDay: false,
                breakMinutes: 60,
                isActive: true,
              },
            ])
          }
          className={subBtn}
        >
          ＋ 勤務パターンを追加
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveNoticeWorkPatterns(rows))}
          className={primaryBtn}
        >
          {pending ? "保存中…" : "勤務パターンを保存"}
        </button>
        <Message message={message} />
      </div>
    </section>
  );
}

// ---------------- 最低賃金 ----------------

function MinWagesSection({ minWages }: { minWages: MinWage[] }) {
  const [draft, setDraft] = useState({ prefecture: "埼玉県", yen: "", effectiveFrom: "" });
  const { pending, message, run } = useSave();

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        毎年10月ごろに改定されます。新しい金額と発効日を追加してください。通知書は「働き始める日」の時点の金額で確認します（古い行は消さずに残してください）。
      </p>
      <table className="w-full max-w-xl text-sm">
        <thead className="text-left text-xs text-slate-600">
          <tr>
            <th className="px-2 py-1">都道府県</th>
            <th className="px-2 py-1">時給</th>
            <th className="px-2 py-1">発効日</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {minWages.map((w) => (
            <tr key={`${w.prefecture}-${w.effectiveFrom}`} className="border-t border-slate-100">
              <td className="px-2 py-2">{w.prefecture}</td>
              <td className="px-2 py-2">{w.yen.toLocaleString()}円</td>
              <td className="px-2 py-2">{w.effectiveFrom.replaceAll("-", "/")}</td>
              <td className="px-2 py-2 text-right">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`${w.prefecture} ${w.effectiveFrom} の行を削除しますか？`)) {
                      run(() => deleteMinWage(w.prefecture, w.effectiveFrom), "削除しました。");
                    }
                  }}
                  className="text-sm text-red-700 hover:underline"
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-slate-600">都道府県</span>
          <input
            value={draft.prefecture}
            onChange={(e) => setDraft((d) => ({ ...d, prefecture: e.target.value }))}
            className={`${inputCls} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-slate-600">時給（円）</span>
          <input
            type="number"
            inputMode="numeric"
            value={draft.yen}
            onChange={(e) => setDraft((d) => ({ ...d, yen: e.target.value }))}
            className={`${inputCls} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-slate-600">発効日</span>
          <input
            type="date"
            value={draft.effectiveFrom}
            onChange={(e) => setDraft((d) => ({ ...d, effectiveFrom: e.target.value }))}
            className={inputCls}
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                addMinWage({
                  prefecture: draft.prefecture,
                  yen: Number.parseInt(draft.yen, 10),
                  effectiveFrom: draft.effectiveFrom,
                }),
              "追加しました。",
            )
          }
          className={primaryBtn}
        >
          追加
        </button>
        <Message message={message} />
      </div>
    </section>
  );
}
