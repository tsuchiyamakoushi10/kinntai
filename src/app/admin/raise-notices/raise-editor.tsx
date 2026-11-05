"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { renderRaiseDocument } from "@/lib/raise-notice/html";
import { checkRaise, emptyOtherRow, rowsFromBase, UNIT_LABEL } from "@/lib/raise-notice/rows";
import type { RaiseInput, RaiseRow, RaiseView, RaiseWageKind } from "@/lib/raise-notice/types";

import { issueRaiseNotice } from "./actions";
import type { RaiseEditorEmployee } from "./editor-data";

type Props = {
  employees: ReadonlyArray<RaiseEditorEmployee>;
  initialEmployeeId: string;
  company: RaiseView["company"];
  today: string;
};

const KIND_LABEL: Record<RaiseWageKind, string> = {
  MONTHLY: "月給",
  HOURLY: "時給",
  NIGHT_DAILY: "夜勤専従（1回あたり）",
};

function inputFor(e: RaiseEditorEmployee | undefined, today: string): RaiseInput {
  return {
    issuedOn: today,
    effectiveOn: today,
    kind: e?.kind ?? "HOURLY",
    rows: e ? e.rows.map((r) => ({ ...r })) : rowsFromBase("HOURLY", 0),
    message: "",
  };
}

export function RaiseEditor(props: Props) {
  const { employees } = props;
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(props.initialEmployeeId);
  const employee = employees.find((e) => e.id === employeeId);
  const [input, setInput] = useState<RaiseInput>(() => inputFor(employee, props.today));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = useMemo(() => checkRaise(input), [input]);
  const previewHtml = useMemo(
    () =>
      renderRaiseDocument({
        ...input,
        employeeName: employee?.name ?? "",
        company: props.company,
        officeName: employee?.officeName ?? "",
      }),
    [input, employee, props.company],
  );

  const set = (patch: Partial<RaiseInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const setRow = (i: number, patch: Partial<RaiseRow>) =>
    setInput((prev) => ({
      ...prev,
      rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));

  function chooseEmployee(id: string) {
    setEmployeeId(id);
    setInput(
      inputFor(
        employees.find((e) => e.id === id),
        props.today,
      ),
    );
    setMessage(null);
  }

  function issue() {
    setMessage(null);
    startTransition(async () => {
      const r = await issueRaiseNotice({ employeeId, input });
      if (!r.ok) return setMessage(r.error);
      router.push(`/admin/raise-notices/${r.id}`);
    });
  }

  const canIssue = employeeId !== "" && check.errors.length === 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Step n={1} title="だれの昇給ですか">
          <select
            value={employeeId}
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
          {employee && (
            <p className="text-sm text-slate-600">
              {employee.source
                ? `今の金額は「${employee.source}」から入れています。`
                : "賃金が登録されていません。今の金額と新しい金額を入れてください。"}
            </p>
          )}
          {employee && !employee.source && (
            <Field label="賃金の形">
              <select
                value={input.kind}
                onChange={(e) => {
                  const kind = e.target.value as RaiseWageKind;
                  set({ kind, rows: rowsFromBase(kind, 0) });
                }}
                className={inputCls}
              >
                {(Object.keys(KIND_LABEL) as RaiseWageKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Step>

        <Step n={2} title="新しい金額">
          <div className="flex flex-col gap-3">
            {input.rows.map((r, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-3">
                {r.key === "OTHER" ? (
                  <div className="flex items-end gap-2">
                    <Field label="手当の名前">
                      <input
                        type="text"
                        value={r.label}
                        placeholder="例: 皆勤手当"
                        onChange={(e) => setRow(i, { label: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => set({ rows: input.rows.filter((_, j) => j !== i) })}
                      className="mb-1 text-sm text-slate-500 underline"
                    >
                      取り消す
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-800">{r.label}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <YenField
                    label={`今（${UNIT_LABEL[r.unit]}）`}
                    value={r.beforeYen}
                    onChange={(v) => setRow(i, { beforeYen: v })}
                  />
                  <YenField
                    label={`新しい金額（${UNIT_LABEL[r.unit]}）`}
                    value={r.afterYen}
                    onChange={(v) => setRow(i, { afterYen: v })}
                    strong
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ rows: [...input.rows, emptyOtherRow()] })}
              className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ＋ 手当を追加
            </button>
          </div>
        </Step>

        <Step n={3} title="日付">
          <div className="grid grid-cols-2 gap-3">
            <Field label="新しい金額にする日">
              <input
                type="date"
                value={input.effectiveOn}
                onChange={(e) => set({ effectiveOn: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="通知する日">
              <input
                type="date"
                value={input.issuedOn}
                onChange={(e) => set({ issuedOn: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </Step>

        <Step n={4} title="ひとこと（なくても可）">
          <textarea
            value={input.message}
            maxLength={500}
            rows={3}
            placeholder="例: 日頃の勤務に感謝いたします。今後ともよろしくお願いします。"
            onChange={(e) => set({ message: e.target.value })}
            className={inputCls}
          />
        </Step>

        <section className="flex flex-col gap-2" aria-live="polite">
          {check.errors.length > 0 && employeeId !== "" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <ul className="list-disc pl-5">
                {check.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {check.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">確認してください</p>
              <ul className="mt-1 list-disc pl-5">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-slate-50 py-3">
          <p className="text-xs text-slate-600">
            発行すると、この人の賃金データ（契約の金額）も新しい金額に変わります。次の労働条件通知書も新しい金額から始まります。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={issue}
              disabled={!canIssue || pending}
              className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {pending ? "発行中…" : "発行する"}
            </button>
            {message && (
              <span role="alert" className="text-sm text-red-700">
                {message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm text-slate-500">プレビュー（A4・1枚）</p>
        <iframe
          title="昇給通知書のプレビュー"
          srcDoc={previewHtml}
          sandbox=""
          className="h-[80vh] w-full rounded-lg border border-slate-200 bg-slate-100"
        />
      </div>
    </div>
  );
}

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";

function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
          {n}
        </span>
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
  strong = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  strong?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(toInt(e.target.value))}
        className={`${inputCls} ${strong ? "border-slate-500 font-semibold" : ""}`}
      />
    </Field>
  );
}
