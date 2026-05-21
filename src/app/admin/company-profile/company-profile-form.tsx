"use client";

import { useState, useTransition } from "react";

import { saveCompanyProfile, type CompanyProfileInput } from "./actions";

type Props = {
  initial: CompanyProfileInput | null;
};

const EMPTY: CompanyProfileInput = {
  legalName: "",
  address: "",
  phone: "",
  representativeTitle: "代表取締役",
  representativeName: "",
  retirementAge: 60,
  continuedEmploymentAge: 65,
  resignNoticeDays: 30,
  wageCutoffDay: "毎月末日",
  wagePaymentDay: "翌月20日",
  wagePaymentMethod: "本人の金融機関口座への振込を原則とする",
  salaryRaisePeriod: "毎年6月に行う場合がある",
  overtimeRateUnder60h: 25,
  overtimeRateOver60h: 25,
  overtimeRateWithin: 0,
  holidayLegalRate: 35,
  nightRate: 25,
  breakRuleText:
    "1日6時間を超える勤務の場合には45分、1日8時間を超える勤務の場合には60分を、途中で与える。",
  workRulesName: "就業規則",
  partTimeWorkRulesName: "パート職員賃金規程",
  contactDepartment: "",
  contactPersonTitle: "",
  contactPersonName: "",
  contactPhone: "",
};

export function CompanyProfileForm({ initial }: Props) {
  const [values, setValues] = useState<CompanyProfileInput>(() => ({
    ...EMPTY,
    ...(initial ?? {}),
  }));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "success"; message: string } | { kind: "error"; message: string } | null
  >(null);

  function setText<K extends keyof CompanyProfileInput>(key: K, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }) as CompanyProfileInput);
  }

  function setNumber<K extends keyof CompanyProfileInput>(key: K, value: string): void {
    const n = Number.parseInt(value, 10);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }) as CompanyProfileInput);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const r = await saveCompanyProfile(values);
      if (r.ok) {
        setFeedback({ kind: "success", message: "保存しました。" });
      } else {
        setFeedback({ kind: "error", message: r.error });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-5"
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full text-base font-semibold text-slate-900">法人情報</legend>
        <Field label="法人名" required>
          <input
            type="text"
            value={values.legalName}
            onChange={(e) => setText("legalName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="所在地" required>
          <input
            type="text"
            value={values.address}
            onChange={(e) => setText("address", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="法人 TEL" required>
          <input
            type="text"
            value={values.phone}
            onChange={(e) => setText("phone", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="代表者役職" required>
          <input
            type="text"
            value={values.representativeTitle}
            onChange={(e) => setText("representativeTitle", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="代表者氏名" required>
          <input
            type="text"
            value={values.representativeName}
            onChange={(e) => setText("representativeName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-full text-base font-semibold text-slate-900">
          退職に関する事項
        </legend>
        <Field label="定年">
          <input
            type="number"
            min={50}
            max={90}
            value={values.retirementAge}
            onChange={(e) => setNumber("retirementAge", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="継続雇用上限年齢">
          <input
            type="number"
            min={values.retirementAge}
            max={100}
            value={values.continuedEmploymentAge}
            onChange={(e) => setNumber("continuedEmploymentAge", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="自己都合退職の事前申出日数">
          <input
            type="number"
            min={0}
            max={365}
            value={values.resignNoticeDays}
            onChange={(e) => setNumber("resignNoticeDays", e.target.value)}
            className={inputCls}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full text-base font-semibold text-slate-900">
          賃金関連 (全契約共通)
        </legend>
        <Field label="賃金締切日" required>
          <input
            type="text"
            value={values.wageCutoffDay}
            onChange={(e) => setText("wageCutoffDay", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="賃金支払日" required>
          <input
            type="text"
            value={values.wagePaymentDay}
            onChange={(e) => setText("wagePaymentDay", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="賃金支払方法" required>
          <input
            type="text"
            value={values.wagePaymentMethod}
            onChange={(e) => setText("wagePaymentMethod", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="昇給時期" required>
          <input
            type="text"
            value={values.salaryRaisePeriod}
            onChange={(e) => setText("salaryRaisePeriod", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-5">
        <legend className="col-span-full text-base font-semibold text-slate-900">
          割増賃金率 (%)
        </legend>
        <Field label="法定超 月60h以内">
          <input
            type="number"
            min={0}
            max={200}
            value={values.overtimeRateUnder60h}
            onChange={(e) => setNumber("overtimeRateUnder60h", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="法定超 月60h超">
          <input
            type="number"
            min={0}
            max={200}
            value={values.overtimeRateOver60h}
            onChange={(e) => setNumber("overtimeRateOver60h", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="所定超">
          <input
            type="number"
            min={0}
            max={200}
            value={values.overtimeRateWithin}
            onChange={(e) => setNumber("overtimeRateWithin", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="法定休日">
          <input
            type="number"
            min={0}
            max={200}
            value={values.holidayLegalRate}
            onChange={(e) => setNumber("holidayLegalRate", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="深夜">
          <input
            type="number"
            min={0}
            max={200}
            value={values.nightRate}
            onChange={(e) => setNumber("nightRate", e.target.value)}
            className={inputCls}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="text-base font-semibold text-slate-900">休憩ルール</legend>
        <Field label="休憩本文" required>
          <textarea
            value={values.breakRuleText}
            onChange={(e) => setText("breakRuleText", e.target.value)}
            className={`${inputCls} min-h-20`}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full text-base font-semibold text-slate-900">就業規則</legend>
        <Field label="就業規則名" required>
          <input
            type="text"
            value={values.workRulesName}
            onChange={(e) => setText("workRulesName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="パート就業規則名" required>
          <input
            type="text"
            value={values.partTimeWorkRulesName}
            onChange={(e) => setText("partTimeWorkRulesName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full text-base font-semibold text-slate-900">相談窓口</legend>
        <Field label="部署名" required>
          <input
            type="text"
            value={values.contactDepartment}
            onChange={(e) => setText("contactDepartment", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="担当者職" required>
          <input
            type="text"
            value={values.contactPersonTitle}
            onChange={(e) => setText("contactPersonTitle", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="担当者氏名" required>
          <input
            type="text"
            value={values.contactPersonName}
            onChange={(e) => setText("contactPersonName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="相談窓口 TEL" required>
          <input
            type="text"
            value={values.contactPhone}
            onChange={(e) => setText("contactPhone", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
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
    </form>
  );
}

const inputCls = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
