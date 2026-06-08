"use client";

import { useMemo, useState, useTransition } from "react";

import {
  OFFICE_SHIFT_SETTING_BOUNDS,
  type OfficeShiftSettingValues,
} from "@/lib/shift/office-setting";

import { saveOfficeShiftSetting } from "./actions";

type FieldKey = keyof OfficeShiftSettingValues;

type FieldDef = {
  key: FieldKey;
  label: string;
  /** 入力欄の右に出す単位。 */
  unit: string;
  /** 業務的な意味の補足 (専門用語を避ける)。 */
  help: string;
  /** 数値の刻み。 */
  step: number;
};

const FIELDS: ReadonlyArray<FieldDef> = [
  {
    key: "maxConsecutiveWorkDays",
    label: "連勤の上限",
    unit: "日",
    help: "この日数を超える連続勤務は自動作成では組みません。",
    step: 1,
  },
  {
    key: "defaultMaxNightShiftsPerMonth",
    label: "1 か月の夜勤回数の上限",
    unit: "回",
    help: "拠点の既定値です。スタッフごとに個別の上限を決めている場合はそちらを優先します。",
    step: 1,
  },
  {
    key: "defaultAnnualIncomeCapYen",
    label: "パートの年収上限",
    unit: "円",
    help: "見込み年収がこの額を超えないようにパートを配置します。拠点の既定値で、スタッフ個別の上限があればそちらを優先します。",
    step: 10000,
  },
];

type Props = {
  officeId: string;
  initialValues: OfficeShiftSettingValues;
  /** 既定値か (= まだこの拠点専用の設定を保存していない)。 */
  isUsingDefaults: boolean;
};

export function SettingsForm({ officeId, initialValues, isUsingDefaults }: Props) {
  const [values, setValues] = useState<OfficeShiftSettingValues>(initialValues);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );

  const dirty = useMemo(
    () => FIELDS.some((f) => values[f.key] !== initialValues[f.key]),
    [values, initialValues],
  );

  function setField(key: FieldKey, raw: string): void {
    const n = Number.parseInt(raw, 10);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  }

  function reset(): void {
    setValues(initialValues);
    setFeedback(null);
  }

  function handleSave(): void {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveOfficeShiftSetting({ officeId, values });
      if (result.ok) {
        setFeedback({ kind: "success", message: "保存しました。" });
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {isUsingDefaults && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          この拠点はまだ専用の設定がありません。下記は既定値です。保存するとこの拠点専用の設定になります。
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
        {FIELDS.map((f) => {
          const { min, max } = OFFICE_SHIFT_SETTING_BOUNDS[f.key];
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label htmlFor={`field-${f.key}`} className="text-sm font-medium text-slate-900">
                {f.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`field-${f.key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={f.step}
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-40 rounded-md border border-slate-300 px-3 py-2 text-right text-sm"
                />
                <span className="text-sm text-slate-500">{f.unit}</span>
              </div>
              <p className="text-xs text-slate-500">{f.help}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !dirty}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          変更を破棄
        </button>
        {feedback && (
          <span
            role={feedback.kind === "error" ? "alert" : "status"}
            className={
              feedback.kind === "error"
                ? "text-sm font-medium text-red-700"
                : "text-sm font-medium text-emerald-700"
            }
          >
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}
