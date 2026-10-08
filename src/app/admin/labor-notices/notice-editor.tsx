"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { computeNotice } from "@/lib/labor-notice/compute";
import {
  EMPLOYMENT_PRESETS,
  EMPLOYMENT_TYPE_LABEL,
  QUALIFICATION_LABEL,
} from "@/lib/labor-notice/constants";
import { applyPreset } from "@/lib/labor-notice/defaults";
import { renderNoticeDocument } from "@/lib/labor-notice/html";
import type {
  InsuranceSet,
  NoticeEmploymentType,
  NoticeInput,
  NoticeIssueCode,
  NoticeMasters,
  NoticeQualification,
  NoticeWageInput,
  PresetTexts,
} from "@/lib/labor-notice/types";

import { issueLaborNotice, saveLaborNoticeDraft } from "./actions";

export type EditorEmployee = {
  id: string;
  name: string;
  officeId: string | null;
  jobDescription: string;
  defaultType: NoticeEmploymentType;
  priorFixedTermMonths: number;
};

type Props = {
  masters: NoticeMasters;
  employees: ReadonlyArray<EditorEmployee>;
  noticeId: string | null;
  replacesNoticeId: string | null;
  initialEmployeeId: string;
  initialInput: NoticeInput | null;
  /** 更新版・無期切替・作り直しでは従業員を変えさせない */
  lockEmployee: boolean;
  today: string;
};

const TYPES: ReadonlyArray<NoticeEmploymentType> = ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"];
const QUALIFICATIONS: ReadonlyArray<NoticeQualification> = [
  "NONE",
  "CARE_WORKER",
  "INITIAL_TRAINING",
  "NURSE",
  "ASSISTANT_NURSE",
];

const TEXT_FIELDS: ReadonlyArray<{ key: keyof PresetTexts; label: string }> = [
  { key: "workingTimeSystem", label: "勤務時間の決め方" },
  { key: "holidays", label: "休日" },
  { key: "trialPeriod", label: "試用期間" },
  { key: "overtime", label: "残業" },
  { key: "holidayWork", label: "休日出勤" },
  { key: "raise", label: "昇給" },
  { key: "bonus", label: "賞与" },
  { key: "retirementAllowance", label: "退職金" },
  { key: "workplaceScope", label: "勤務先が変わる可能性" },
  { key: "jobScope", label: "仕事内容が変わる可能性" },
];

function initialFor(
  employee: EditorEmployee | undefined,
  today: string,
  masters: NoticeMasters,
): NoticeInput {
  const type = employee?.defaultType ?? "PART_TIME";
  return applyPreset(type, {
    employeeName: employee?.name ?? "",
    issuedOn: today,
    contractStartOn: today,
    officeId: employee?.officeId ?? masters.offices[0]?.id ?? "",
    jobDescription: employee?.jobDescription ?? "",
    priorFixedTermMonths: employee?.priorFixedTermMonths ?? 0,
    isPostRetirementRehire: false,
    isStudent: false,
  });
}

export function NoticeEditor(props: Props) {
  const { masters, employees } = props;
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(props.initialEmployeeId);
  const employee = employees.find((e) => e.id === employeeId);
  const [input, setInput] = useState<NoticeInput>(
    () => props.initialInput ?? initialFor(employee, props.today, masters),
  );
  const [acks, setAcks] = useState<
    Partial<Record<NoticeIssueCode, { checked: boolean; reason: string }>>
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const result = useMemo(() => computeNotice(input, masters), [input, masters]);
  const previewHtml = useMemo(
    () => (result.view ? renderNoticeDocument(result.view, { noticeNo: null, preview: true }) : ""),
    [result.view],
  );
  const preset = EMPLOYMENT_PRESETS[input.employmentType];
  const texts = { ...preset.texts, ...input.overrides };

  const set = (patch: Partial<NoticeInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const setWage = (patch: Partial<NoticeWageInput>) =>
    setInput((prev) => ({ ...prev, wage: { ...prev.wage, ...patch } as NoticeWageInput }));

  function chooseEmployee(id: string) {
    setEmployeeId(id);
    const e = employees.find((x) => x.id === id);
    if (!e) return;
    setInput(initialFor(e, props.today, masters));
    setAcks({});
  }

  function chooseType(type: NoticeEmploymentType) {
    setInput((prev) => applyPreset(type, prev));
    setAcks({});
  }

  function togglePattern(code: string) {
    setInput((prev) => ({
      ...prev,
      patternCodes: prev.patternCodes.includes(code)
        ? prev.patternCodes.filter((c) => c !== code)
        : masters.patterns
            .map((p) => p.code)
            .filter((c) => c === code || prev.patternCodes.includes(c)),
    }));
  }

  function setOverride(key: keyof PresetTexts, value: string) {
    setInput((prev) => ({ ...prev, overrides: { ...prev.overrides, [key]: value } }));
  }

  const allAcked = result.warnings.every((w) => {
    const a = acks[w.code];
    return a?.checked && a.reason.trim() !== "";
  });
  const canIssue =
    employeeId !== "" && result.view !== null && result.errors.length === 0 && allAcked;

  function payload() {
    return {
      noticeId: props.noticeId,
      employeeId,
      input,
      replacesNoticeId: props.replacesNoticeId,
      acknowledgements: result.warnings.map((w) => ({
        code: w.code,
        reason: acks[w.code]?.reason ?? "",
      })),
    };
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveLaborNoticeDraft(payload());
      if (!r.ok) return setMessage(r.error);
      setMessage("下書きを保存しました。");
      if (!props.noticeId) router.replace(`/admin/labor-notices/${r.id}/edit`);
    });
  }

  function issue() {
    setMessage(null);
    startTransition(async () => {
      const r = await issueLaborNotice(payload());
      if (!r.ok) return setMessage(r.error);
      router.push(`/admin/labor-notices/${r.id}`);
    });
  }

  const w = input.wage;
  const isFixed = input.fixedTermMonths !== null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        {/* チェック結果 */}
        <section className="flex flex-col gap-2" aria-live="polite">
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">発行する前に入力してください</p>
              <ul className="mt-1 list-disc pl-5">
                {result.errors.map((e) => (
                  <li key={e.field}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.map((warn) => {
            const a = acks[warn.code] ?? { checked: false, reason: "" };
            return (
              <div
                key={warn.code}
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <p className="font-semibold">確認してください</p>
                <p className="mt-1">{warn.message}</p>
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={a.checked}
                    onChange={(e) =>
                      setAcks((p) => ({ ...p, [warn.code]: { ...a, checked: e.target.checked } }))
                    }
                    className="size-5"
                  />
                  確認しました
                </label>
                <input
                  type="text"
                  value={a.reason}
                  placeholder="このまま発行する理由（例: 1月から時給を上げる予定）"
                  onChange={(e) =>
                    setAcks((p) => ({ ...p, [warn.code]: { ...a, reason: e.target.value } }))
                  }
                  className={`${inputCls} mt-2 w-full`}
                />
              </div>
            );
          })}
          {result.errors.length === 0 && result.warnings.length === 0 && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              入力に問題はありません。
            </p>
          )}
        </section>

        <Step n={0} title="従業員">
          <select
            value={employeeId}
            disabled={props.lockEmployee}
            onChange={(e) => chooseEmployee(e.target.value)}
            className={inputCls}
          >
            <option value="">選んでください</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Step>

        <Step n={1} title="雇用形態">
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => chooseType(t)}
                aria-pressed={input.employmentType === t}
                className={`rounded-lg border px-3 py-3 text-base font-semibold ${
                  input.employmentType === t
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                {EMPLOYMENT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Step>

        <Step n={2} title="契約期間">
          <div className="grid grid-cols-2 gap-3">
            <Field label="働き始める日">
              <input
                type="date"
                value={input.contractStartOn}
                onChange={(e) => set({ contractStartOn: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="期間">
              <select
                value={isFixed ? "fixed" : "none"}
                onChange={(e) =>
                  set(
                    e.target.value === "fixed"
                      ? { fixedTermMonths: preset.defaultFixedTermMonths ?? 6 }
                      : { fixedTermMonths: null, convertsToIndefinite: false },
                  )
                }
                className={inputCls}
              >
                <option value="none">期間の定めなし</option>
                <option value="fixed">期間あり</option>
              </select>
            </Field>
            {isFixed && (
              <Field label="何か月">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={input.fixedTermMonths ?? ""}
                  onChange={(e) => set({ fixedTermMonths: toInt(e.target.value) || 1 })}
                  className={inputCls}
                />
              </Field>
            )}
            {isFixed && (
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.convertsToIndefinite}
                  onChange={(e) => set({ convertsToIndefinite: e.target.checked })}
                  className="size-5"
                />
                期間が終わったら「期間の定めなし」に切り替える
              </label>
            )}
            {result.view?.contract.endOn && (
              <p className="col-span-2 text-sm text-slate-600">
                終わりの日: <b>{result.view.contract.endOn.replaceAll("-", "/")}</b>
              </p>
            )}
          </div>
        </Step>

        <Step n={3} title="勤務先">
          <select
            value={input.officeId}
            onChange={(e) => set({ officeId: e.target.value })}
            className={inputCls}
          >
            <option value="">選んでください</option>
            {masters.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {result.view && !result.view.office.managerName && input.officeId && (
            <p className="text-xs text-amber-700">
              この事業所の管理者名が未登録です（設定 → 拠点）。
            </p>
          )}
        </Step>

        <Step n={4} title="賃金">
          {w.kind === "MONTHLY" && (
            <div className="grid grid-cols-2 gap-3">
              <YenField
                label="基本給（月額）"
                value={w.baseYen}
                onChange={(v) => setWage({ baseYen: v })}
              />
              <QualificationField wage={w} onChange={setWage} />
              <Field label="ひとり親手当の対象の子の数">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={w.singleParentChildren}
                  onChange={(e) => setWage({ singleParentChildren: toInt(e.target.value) })}
                  className={inputCls}
                />
              </Field>
              <YenField
                label="管理者手当（月額）"
                value={w.managerAllowanceYen}
                onChange={(v) => setWage({ managerAllowanceYen: v })}
              />
              <YenField
                label="相談員手当（月額）"
                value={w.counselorAllowanceYen}
                onChange={(v) => setWage({ counselorAllowanceYen: v })}
              />
            </div>
          )}
          {w.kind === "HOURLY" && (
            <div className="grid grid-cols-2 gap-3">
              <YenField
                label="時給"
                value={w.hourlyYen}
                onChange={(v) => setWage({ hourlyYen: v })}
              />
              <QualificationField wage={w} onChange={setWage} />
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={w.worksNight}
                  onChange={(e) => setWage({ worksNight: e.target.checked })}
                  className="size-5"
                />
                夜勤にも入る（夜勤手当を書面に載せる）
              </label>
            </div>
          )}
          {w.kind === "NIGHT_DAILY" && (
            <div className="grid grid-cols-2 gap-3">
              <YenField
                label="1回あたり（深夜手当こみ）"
                value={w.totalYen}
                onChange={(v) => setWage({ totalYen: v })}
              />
              <Field label="22時〜翌5時の時間数">
                <input
                  type="number"
                  min={0}
                  max={7}
                  step="0.5"
                  value={w.nightHours}
                  onChange={(e) => setWage({ nightHours: toNum(e.target.value) })}
                  className={inputCls}
                />
              </Field>
              {result.view?.wage.nightBreakdown?.map((b) => (
                <p key={b.label} className="col-span-2 text-xs text-slate-600">
                  {b.label}（{b.workHours}時間）: 基本 {b.baseYen.toLocaleString()}円 ＋ 深夜分{" "}
                  {b.premiumYen.toLocaleString()}円
                </p>
              ))}
            </div>
          )}
        </Step>

        <Step n={5} title="勤務時間">
          <div className="flex flex-wrap gap-2">
            {masters.patterns.map((p) => {
              const on = input.patternCodes.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePattern(p.code)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    on
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {p.label} {p.start.replace(/^0/, "")}〜{p.endsNextDay ? "翌" : ""}
                  {p.end.replace(/^0/, "")}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="週に何日">
              <input
                type="number"
                min={0}
                max={7}
                step="0.5"
                value={input.daysPerWeek}
                onChange={(e) => set({ daysPerWeek: toNum(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="週に何時間">
              <input
                type="number"
                min={0}
                max={60}
                step="0.5"
                value={input.hoursPerWeek}
                onChange={(e) => set({ hoursPerWeek: toNum(e.target.value) })}
                className={inputCls}
              />
            </Field>
            {input.employmentType === "FULL_TIME" && (
              <Field label="1か月平均の時間">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={input.monthlyHours ?? ""}
                  onChange={(e) => set({ monthlyHours: toNum(e.target.value) })}
                  className={inputCls}
                />
              </Field>
            )}
          </div>
          {result.view && (
            <p className="text-sm text-slate-600">
              有給（6か月後）: <b>{result.view.paidLeaveDays}日</b>　／　社会保険:{" "}
              <b>{label(result.view.insurance.health)}</b>　雇用保険:{" "}
              <b>{label(result.view.insurance.employment)}</b>
            </p>
          )}
        </Step>

        <details className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            その他の項目（ふだんは変更不要）
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="仕事の内容">
              <input
                type="text"
                value={input.jobDescription}
                onChange={(e) => set({ jobDescription: e.target.value })}
                className={inputCls}
              />
            </Field>
            {TEXT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type="text"
                  value={texts[f.key] ?? ""}
                  onChange={(e) => setOverride(f.key, e.target.value)}
                  className={inputCls}
                />
              </Field>
            ))}
            <Field label="週の時間の書き方（空欄なら自動）">
              <input
                type="text"
                value={input.weeklyHoursText ?? ""}
                placeholder={`約${input.hoursPerWeek}時間（週${input.daysPerWeek}日程度）`}
                onChange={(e) => set({ weeklyHoursText: e.target.value || null })}
                className={inputCls}
              />
            </Field>
            <Field label="交付日">
              <input
                type="date"
                value={input.issuedOn}
                onChange={(e) => set({ issuedOn: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="これまでの期間ありの契約の合計（か月）">
              <input
                type="number"
                min={0}
                value={input.priorFixedTermMonths}
                onChange={(e) => set({ priorFixedTermMonths: toInt(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={input.isPostRetirementRehire}
                onChange={(e) => set({ isPostRetirementRehire: e.target.checked })}
                className="size-5"
              />
              定年後の再雇用
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={input.isStudent}
                onChange={(e) => set({ isStudent: e.target.checked })}
                className="size-5"
              />
              学生
            </label>
            <InsuranceOverride
              value={input.insuranceOverride}
              judged={result.view?.insurance ?? null}
              onChange={(v) => set({ insuranceOverride: v })}
            />
          </div>
        </details>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
          <button
            type="button"
            onClick={issue}
            disabled={!canIssue || pending}
            className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            発行する
          </button>
          <button
            type="button"
            onClick={save}
            disabled={employeeId === "" || pending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            下書き保存
          </button>
          {message && (
            <span role="status" className="text-sm text-slate-700">
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm text-slate-500">プレビュー（A4・3枚）</p>
        {previewHtml ? (
          <iframe
            title="労働条件通知書のプレビュー"
            srcDoc={previewHtml}
            sandbox=""
            className="h-[80vh] w-full rounded-lg border border-slate-200 bg-slate-100"
          />
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            開始日を入れるとプレビューが出ます。
          </p>
        )}
      </div>
    </div>
  );
}

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";

function label(s: "ENROLLED" | "NOT_ENROLLED"): string {
  return s === "ENROLLED" ? "加入" : "対象外";
}
function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
function toNum(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        {n > 0 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
            {n}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
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

function YenField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(toInt(e.target.value))}
        className={inputCls}
      />
    </Field>
  );
}

function QualificationField({
  wage,
  onChange,
}: {
  wage: Extract<NoticeWageInput, { kind: "MONTHLY" | "HOURLY" }>;
  onChange: (patch: Partial<NoticeWageInput>) => void;
}) {
  return (
    <>
      <Field label="資格">
        <select
          value={wage.qualification}
          onChange={(e) =>
            onChange({
              qualification: e.target.value as NoticeQualification,
              qualificationAllowanceYen: null,
            })
          }
          className={inputCls}
        >
          {QUALIFICATIONS.map((q) => (
            <option key={q} value={q}>
              {QUALIFICATION_LABEL[q]}
            </option>
          ))}
        </select>
      </Field>
      {wage.qualification !== "NONE" && (
        <Field label="資格手当（月額・空欄なら既定額）">
          <input
            type="number"
            min={0}
            value={wage.qualificationAllowanceYen ?? ""}
            onChange={(e) =>
              onChange({
                qualificationAllowanceYen: e.target.value === "" ? null : toInt(e.target.value),
              })
            }
            className={inputCls}
          />
        </Field>
      )}
    </>
  );
}

function InsuranceOverride({
  value,
  judged,
  onChange,
}: {
  value: InsuranceSet | null;
  judged: InsuranceSet | null;
  onChange: (v: InsuranceSet | null) => void;
}) {
  const current = value ?? judged;
  if (!current) return null;
  const keys: ReadonlyArray<{ key: keyof InsuranceSet; label: string }> = [
    { key: "health", label: "健康保険" },
    { key: "pension", label: "厚生年金" },
    { key: "employment", label: "雇用保険" },
  ];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) => onChange(e.target.checked ? current : null)}
          className="size-5"
        />
        社会保険・雇用保険を手で決める（自動判定と違う場合）
      </label>
      {value && (
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Field key={k.key} label={k.label}>
              <select
                value={value[k.key]}
                onChange={(e) =>
                  onChange({ ...value, [k.key]: e.target.value as InsuranceSet[typeof k.key] })
                }
                className={inputCls}
              >
                <option value="ENROLLED">加入</option>
                <option value="NOT_ENROLLED">対象外</option>
              </select>
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}
