"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { EMPLOYMENT_TYPE_OPTIONS, WAGE_TYPE_OPTIONS } from "@/lib/employee-labels";

import type {
  AllowanceInput,
  EmploymentContractFormState,
  EmploymentContractFormValues,
} from "./actions";

type AllowanceRow = { name: string; amountYen: string; calculationMethod: string };

const WEEKLY_HOURS_OPTIONS = [
  { value: "", label: "未設定" },
  { value: "UNDER_20", label: "20時間未満 (パート)" },
  { value: "BETWEEN_20_30", label: "20–30時間未満 (雇用保険)" },
  { value: "BETWEEN_30_40", label: "30–40時間 (社保 + 雇用保険)" },
];

const SPECIAL_MEASURE_OPTIONS = [
  { value: "NONE", label: "対象外" },
  { value: "HIGH_SKILL", label: "Ⅰ 高度専門" },
  { value: "POST_RETIREMENT", label: "Ⅱ 定年後の高齢者" },
];

function parseAllowanceRows(json: string): AllowanceRow[] {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (r): r is { name?: unknown; amountYen?: unknown; calculationMethod?: unknown } =>
          typeof r === "object" && r !== null,
      )
      .map((r) => ({
        name: typeof r.name === "string" ? r.name : "",
        amountYen:
          typeof r.amountYen === "number"
            ? String(r.amountYen)
            : typeof r.amountYen === "string"
              ? r.amountYen
              : "",
        calculationMethod: typeof r.calculationMethod === "string" ? r.calculationMethod : "",
      }));
  } catch {
    return [];
  }
}

function ensureMinRows(rows: AllowanceRow[], min: number): AllowanceRow[] {
  if (rows.length >= min) return rows;
  return [
    ...rows,
    ...Array.from({ length: min - rows.length }, () => ({
      name: "",
      amountYen: "",
      calculationMethod: "",
    })),
  ];
}

type Props = {
  action: (
    state: EmploymentContractFormState,
    formData: FormData,
  ) => Promise<EmploymentContractFormState>;
  initial: EmploymentContractFormValues;
  employeeId: string;
  submitLabel: string;
};

export function ContractForm({ action, initial, employeeId, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<EmploymentContractFormState, FormData>(
    action,
    { values: initial },
  );
  const v = state.values ?? initial;

  // 諸手当: client 側の状態として持ち、submit 時に hidden input で JSON 文字列を送る
  const [allowances, setAllowances] = useState<AllowanceRow[]>(() =>
    ensureMinRows(parseAllowanceRows(v.allowancesJson), 4),
  );
  const allowancesJson = useMemo(() => {
    const filtered: AllowanceInput[] = [];
    for (const r of allowances) {
      const name = r.name.trim();
      const calculationMethod = r.calculationMethod.trim();
      if (name === "" && r.amountYen.trim() === "" && calculationMethod === "") continue;
      const amount = Number.parseInt(r.amountYen, 10);
      filtered.push({
        name,
        amountYen: Number.isFinite(amount) && amount >= 0 ? amount : 0,
        calculationMethod,
      });
    }
    return JSON.stringify(filtered);
  }, [allowances]);

  function setAllowance(idx: number, patch: Partial<AllowanceRow>): void {
    setAllowances((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function addAllowance(): void {
    setAllowances((prev) => [...prev, { name: "", amountYen: "", calculationMethod: "" }]);
  }
  function removeAllowance(idx: number): void {
    setAllowances((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      <Section title="契約期間 / 雇用形態">
        <Row>
          <Field label="契約開始日">
            <input
              type="date"
              name="contractStartOn"
              defaultValue={v.contractStartOn}
              required
              className={inputCls}
            />
          </Field>
          <Field label="契約終了日" hint="正社員 (無期) は空欄">
            <input
              type="date"
              name="contractEndOn"
              defaultValue={v.contractEndOn}
              className={inputCls}
            />
          </Field>
        </Row>
        <Row>
          <Field label="雇用形態">
            <select
              name="employmentType"
              defaultValue={v.employmentType}
              required
              className={inputCls}
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div />
        </Row>
      </Section>

      <Section title="勤務条件">
        <Row>
          <Field label="週所定労働日数" hint="0.5〜7.0">
            <input
              name="workingDaysPerWeek"
              type="number"
              step="0.5"
              min="0.5"
              max="7"
              defaultValue={v.workingDaysPerWeek}
              required
              className={inputCls}
            />
          </Field>
          <Field label="1 日の所定労働時間" hint="0.5〜12.0">
            <input
              name="workingHoursPerDay"
              type="number"
              step="0.25"
              min="0.5"
              max="12"
              defaultValue={v.workingHoursPerDay}
              required
              className={inputCls}
            />
          </Field>
        </Row>
        <Row>
          <Field label="賃金形態">
            <select name="wageType" defaultValue={v.wageType} required className={inputCls}>
              {WAGE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="賃金額（円）" hint="月給なら月額、時給なら時間単価">
            <input
              name="wageAmount"
              type="number"
              step="1"
              min="1"
              defaultValue={v.wageAmount}
              required
              className={inputCls}
            />
          </Field>
        </Row>
      </Section>

      <Section title="更新管理">
        <CheckboxRow name="isRenewable" label="更新あり" defaultChecked={v.isRenewable === "on"} />
        <Row>
          <Field label="既往の更新回数" hint="未更新は 0">
            <input
              name="renewalCount"
              type="number"
              step="1"
              min="0"
              max="999"
              defaultValue={v.renewalCount}
              className={inputCls}
            />
          </Field>
          <div />
        </Row>
        <CheckboxRow
          name="hasRenewalLimit"
          label="更新上限あり"
          defaultChecked={v.hasRenewalLimit === "on"}
        />
        <Row>
          <Field label="更新上限回数" hint="更新上限ありの場合のみ">
            <input
              name="renewalLimitCount"
              type="number"
              step="1"
              min="1"
              max="999"
              defaultValue={v.renewalLimitCount}
              className={inputCls}
            />
          </Field>
          <div />
        </Row>
        <Field label="更新判断基準（任意）" hint="社労士・本人説明用">
          <textarea
            name="renewalCriteria"
            rows={3}
            defaultValue={v.renewalCriteria}
            placeholder="例: 勤務成績・健康状態・事業所の経営状況"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="保険">
        <CheckboxRow
          name="hasEmploymentInsurance"
          label="雇用保険 加入"
          defaultChecked={v.hasEmploymentInsurance === "on"}
        />
        <CheckboxRow
          name="hasSocialInsurance"
          label="社会保険 加入"
          defaultChecked={v.hasSocialInsurance === "on"}
        />
      </Section>

      <Section title="退職金">
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="font-medium text-slate-700">退職金対象</legend>
          <RadioOption
            name="retirementAllowanceEligible"
            value="auto"
            label="自動判定にまかせる"
            hint="正社員として通算 3 年経過で対象を自動表示"
            defaultChecked={v.retirementAllowanceEligible === "auto"}
          />
          <RadioOption
            name="retirementAllowanceEligible"
            value="true"
            label="対象（手動で確定）"
            defaultChecked={v.retirementAllowanceEligible === "true"}
          />
          <RadioOption
            name="retirementAllowanceEligible"
            value="false"
            label="対象外（手動で確定）"
            defaultChecked={v.retirementAllowanceEligible === "false"}
          />
        </fieldset>
      </Section>

      <Section title="キャリアアップ助成金">
        <CheckboxRow
          name="careerSubsidyTarget"
          label="助成金対象として記録する"
          defaultChecked={v.careerSubsidyTarget === "on"}
        />
        <Field label="助成金メモ（任意）" hint="社労士確認用の補足">
          <textarea
            name="careerSubsidyNotes"
            rows={3}
            defaultValue={v.careerSubsidyNotes}
            placeholder="例: 正社員転換コース、対象期間 〜"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="労働条件通知書 出力用">
        <p className="text-xs text-slate-500">
          ここから下は PDF 出力 (S-A-15 / S-A-18) で参照されます。サンプル書式
          (株式会社クロスハート様式) に対応した項目です。
        </p>
        <Row>
          <Field label="就業の場所 (雇入直後)" hint="例: ショートステイ結いの心">
            <input
              type="text"
              name="workplaceInitial"
              defaultValue={v.workplaceInitial}
              className={inputCls}
            />
          </Field>
          <Field label="就業の場所 (変更の範囲)" hint="2024 年改正で必須">
            <input
              type="text"
              name="workplaceScope"
              defaultValue={v.workplaceScope}
              className={inputCls}
            />
          </Field>
        </Row>
        <Row>
          <Field label="従事すべき業務 (雇入直後)" hint="例: 介護業務(夜勤専従)">
            <input
              type="text"
              name="jobDescriptionInitial"
              defaultValue={v.jobDescriptionInitial}
              className={inputCls}
            />
          </Field>
          <Field label="従事すべき業務 (変更の範囲)">
            <input
              type="text"
              name="jobDescriptionScope"
              defaultValue={v.jobDescriptionScope}
              className={inputCls}
            />
          </Field>
        </Row>
        <Field label="週所定労働時間区分">
          <select
            name="weeklyHoursCategory"
            defaultValue={v.weeklyHoursCategory}
            className={inputCls}
          >
            {WEEKLY_HOURS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-2 sm:grid-cols-3">
          <CheckboxRow
            name="shiftBasedSchedule"
            label="シフト勤務 (始終業はシフトで定める)"
            defaultChecked={v.shiftBasedSchedule === "on"}
          />
          <CheckboxRow
            name="hasEarlyEndPossibility"
            label="終業時刻の繰上げの可能性あり"
            defaultChecked={v.hasEarlyEndPossibility === "on"}
          />
          <CheckboxRow
            name="hasOvertime"
            label="所定時間外労働 あり"
            defaultChecked={v.hasOvertime === "on"}
          />
        </div>
        <CheckboxRow name="hasBonus" label="賞与 あり" defaultChecked={v.hasBonus === "on"} />
        <Field label="賞与の内容 (有のとき)">
          <input
            type="text"
            name="bonusDescription"
            defaultValue={v.bonusDescription}
            className={inputCls}
            placeholder="年2回 会社業績及び個人の勤務成績・将来性等により支給"
          />
        </Field>
        <Field label="退職金 支給開始時期 (有のとき)" hint="例: 勤務開始より満3年経過後より開始">
          <input
            type="text"
            name="retirementAllowanceStartText"
            defaultValue={v.retirementAllowanceStartText}
            className={inputCls}
          />
        </Field>
        <Row>
          <Field label="有期雇用特別措置法の特例">
            <select
              name="specialMeasureType"
              defaultValue={v.specialMeasureType || "NONE"}
              className={inputCls}
            >
              {SPECIAL_MEASURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="特定有期業務 (高度専門のみ)">
            <input
              type="text"
              name="specialMeasureBusinessTitle"
              defaultValue={v.specialMeasureBusinessTitle}
              className={inputCls}
            />
          </Field>
        </Row>
        <Row>
          <Field label="特定有期業務 開始日">
            <input
              type="date"
              name="specialMeasureStartOn"
              defaultValue={v.specialMeasureStartOn}
              className={inputCls}
            />
          </Field>
          <Field label="特定有期業務 完了日">
            <input
              type="date"
              name="specialMeasureEndOn"
              defaultValue={v.specialMeasureEndOn}
              className={inputCls}
            />
          </Field>
        </Row>
      </Section>

      <Section title="諸手当 (イロハニ)">
        <p className="text-xs text-slate-500">
          基本賃金とは別に支給する手当。PDF
          の「諸手当」欄に転記されます。空欄行は保存時に無視されます。
        </p>
        <input type="hidden" name="allowancesJson" value={allowancesJson} />
        <div className="flex flex-col gap-2">
          {allowances.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.5fr_1fr_2fr_auto]"
            >
              <input
                type="text"
                value={row.name}
                onChange={(e) => setAllowance(idx, { name: e.target.value })}
                placeholder="手当名 (例: 夜勤手当)"
                className={inputCls}
              />
              <input
                type="number"
                min={0}
                max={10000000}
                step={1}
                value={row.amountYen}
                onChange={(e) => setAllowance(idx, { amountYen: e.target.value })}
                placeholder="金額"
                className={inputCls}
              />
              <input
                type="text"
                value={row.calculationMethod}
                onChange={(e) => setAllowance(idx, { calculationMethod: e.target.value })}
                placeholder="計算方法 (例: 20000円/1回×夜勤回数)"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => removeAllowance(idx)}
                className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                aria-label={`${idx + 1} 行目を削除`}
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addAllowance}
          className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          + 行を追加
        </button>
      </Section>

      <Section title="備考">
        <Field label="備考（任意）">
          <textarea name="notes" rows={3} defaultValue={v.notes} className={inputCls} />
        </Field>
      </Section>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link
          href={`/admin/employees/${employeeId}?tab=contracts`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function CheckboxRow({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
      />
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

function RadioOption({
  name,
  value,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-500"
      />
      <span className="flex flex-col">
        <span className="text-sm text-slate-700">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
