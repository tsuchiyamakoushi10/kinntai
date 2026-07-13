"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_CATEGORY_OPTIONS,
  WAGE_TYPE_OPTIONS,
} from "@/lib/employee-labels";

import type { EmployeeFormState, EmployeeFormValues } from "./actions";

export type EmployeeFormOffice = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  action: (state: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  initial: EmployeeFormValues;
  offices: ReadonlyArray<EmployeeFormOffice>;
  submitLabel: string;
  // 既存従業員の編集時、参考情報として表示する
  meta?: {
    employeeCode: string;
    statusLabel: string;
    statusTone: "active" | "retired";
  };
};

export function EmployeeForm({ action, initial, offices, submitLabel, meta }: Props) {
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;

  // 週合計時間の補助表示用ローカルステート（保存はしない、見せるだけ）
  const [weeklyDays, setWeeklyDays] = useState<string>(v.weeklyWorkDays);
  const [dailyHours, setDailyHours] = useState<string>(v.dailyWorkHours);
  const weeklyTotal = useMemo(() => {
    const d = Number(weeklyDays);
    const h = Number(dailyHours);
    if (!Number.isFinite(d) || !Number.isFinite(h)) return null;
    return Math.round(d * h * 10) / 10;
  }, [weeklyDays, dailyHours]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      {meta && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="font-mono text-xs text-slate-500">{meta.employeeCode}</span>
          <StatusChip label={meta.statusLabel} tone={meta.statusTone} />
        </div>
      )}

      <Section title="基本情報">
        <Row>
          <Field label="姓" hint="例: 山田">
            <input name="lastName" defaultValue={v.lastName} required className={inputCls} />
          </Field>
          <Field label="名" hint="例: 花子">
            <input name="firstName" defaultValue={v.firstName} className={inputCls} />
          </Field>
        </Row>
        <Row>
          <Field label="姓 (フリガナ)" hint="カタカナ。例: ヤマダ">
            <input name="lastNameKana" defaultValue={v.lastNameKana} className={inputCls} />
          </Field>
          <Field label="名 (フリガナ)" hint="カタカナ。例: ハナコ">
            <input name="firstNameKana" defaultValue={v.firstNameKana} className={inputCls} />
          </Field>
        </Row>
        <Row>
          <Field label="生年月日">
            <input type="date" name="birthDate" defaultValue={v.birthDate} className={inputCls} />
          </Field>
          <div />
        </Row>
      </Section>

      <Section title="連絡先">
        <Row>
          <Field label="メールアドレス" hint="ログインに使う">
            <input
              type="email"
              name="email"
              defaultValue={v.email}
              autoComplete="off"
              className={inputCls}
            />
          </Field>
          <Field label="電話番号" hint="任意。緊急連絡用">
            <input name="phone" defaultValue={v.phone} autoComplete="off" className={inputCls} />
          </Field>
        </Row>
      </Section>

      <Section title="所属">
        <Row>
          <Field label="所属拠点">
            <select name="officeId" defaultValue={v.officeId} className={inputCls}>
              <option value="">（未設定）</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}（{o.code}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="職種">
            <select name="jobCategory" defaultValue={v.jobCategory} className={inputCls}>
              <option value="">（未設定）</option>
              {JOB_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="雇用形態">
            <select name="employmentType" defaultValue={v.employmentType} className={inputCls}>
              <option value="">（未設定）</option>
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

      <Section title="シフト">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            name="nightShiftOnly"
            defaultChecked={v.nightShiftOnly}
            className="mt-1 h-5 w-5 rounded border-slate-300"
          />
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium text-slate-700">夜勤専従</span>
            <span className="text-xs text-slate-500">
              シフト希望で夜勤を入れた日だけ夜勤に入り、それ以外の日は自動で休み（公休）になります。
              ナーシング・ショートの自動作成のみ反映されます。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            name="nightRequestOnly"
            defaultChecked={v.nightRequestOnly}
            className="mt-1 h-5 w-5 rounded border-slate-300"
          />
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium text-slate-700">夜勤は希望日まで（夜勤チェッカー）</span>
            <span className="text-xs text-slate-500">
              シフト希望で夜勤を入れた日までしか夜勤に入りません（それ以上は増やしません）。足りない夜勤はチェックの無い人に振り分けられます。日勤は通常どおり入ります。ナーシング・ショートの自動作成のみ反映されます。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            name="isManager"
            defaultChecked={v.isManager}
            className="mt-1 h-5 w-5 rounded border-slate-300"
          />
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium text-slate-700">
              管理者（事務日・実績周り日を提出する）
            </span>
            <span className="text-xs text-slate-500">
              この職員はシフト希望の画面で「事務日」「実績周り日」を指定できます。自動作成では指定した日を事務・実績周りの勤務で固定し、そこに休みは入りません（月あたり事務日2日・実績周り日1日が目安）。ログインの権限とは別の設定です。
            </span>
          </span>
        </label>
      </Section>

      <Section title="雇用契約">
        <Row>
          <Field label="入社日" hint="実際に勤務を始めた日">
            <input type="date" name="joinedAt" defaultValue={v.joinedAt} className={inputCls} />
          </Field>
          <Field label="雇い入れ日" hint="契約上の起算日（有給付与の起点）">
            <input type="date" name="hiredAt" defaultValue={v.hiredAt} className={inputCls} />
          </Field>
        </Row>
        <Row>
          <Field label="週所定労働日数" hint="0.5〜7.0">
            <input
              name="weeklyWorkDays"
              type="number"
              step="0.5"
              min="0.5"
              max="7"
              defaultValue={v.weeklyWorkDays}
              className={inputCls}
              onChange={(e) => setWeeklyDays(e.currentTarget.value)}
            />
          </Field>
          <Field
            label="1 日の所定労働時間"
            hint={weeklyTotal !== null ? `週合計の目安: ${weeklyTotal} 時間` : "0.5〜12.0"}
          >
            <input
              name="dailyWorkHours"
              type="number"
              step="0.25"
              min="0.5"
              max="12"
              defaultValue={v.dailyWorkHours}
              className={inputCls}
              onChange={(e) => setDailyHours(e.currentTarget.value)}
            />
          </Field>
        </Row>
      </Section>

      <Section title="給与">
        <Row>
          <Field label="給与形態">
            <select name="baseWageType" defaultValue={v.baseWageType} className={inputCls}>
              <option value="">（未設定）</option>
              {WAGE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="基本給（円）" hint="月給なら月額、時給なら時間単価">
            <input
              name="baseWageAmount"
              type="number"
              step="1"
              min="1"
              defaultValue={v.baseWageAmount}
              className={inputCls}
            />
          </Field>
        </Row>
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
          href="/admin/employees"
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

function StatusChip({ label, tone }: { label: string; tone: "active" | "retired" }) {
  const cls = tone === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
