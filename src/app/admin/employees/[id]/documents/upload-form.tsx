"use client";

import { useActionState, useEffect, useRef } from "react";

import { DOCUMENT_TYPE_OPTIONS } from "@/lib/employee-labels";

import type { DocumentUploadFormState, DocumentUploadFormValues } from "./actions";

const EMPTY_VALUES: DocumentUploadFormValues = {
  title: "",
  documentType: "RESUME",
  expiresOn: "",
  notes: "",
  trainingRecordId: "",
};

export type TrainingOption = {
  id: string;
  label: string;
};

type Props = {
  action: (state: DocumentUploadFormState, formData: FormData) => Promise<DocumentUploadFormState>;
  trainingOptions?: ReadonlyArray<TrainingOption>;
};

export function DocumentUploadForm({ action, trainingOptions = [] }: Props) {
  const [state, formAction, pending] = useActionState<DocumentUploadFormState, FormData>(action, {
    values: EMPTY_VALUES,
  });
  const v = state.values ?? EMPTY_VALUES;
  const formRef = useRef<HTMLFormElement>(null);

  // 成功時 (error なし & values なし = 初期形) はフォームをリセットして連続アップロードに備える。
  useEffect(() => {
    if (!state.error && !state.values) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <h3 className="text-sm font-semibold text-slate-800">書類を追加する</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">書類名</span>
          <input
            type="text"
            name="title"
            defaultValue={v.title}
            required
            maxLength={200}
            placeholder="例: 2026 年度 雇用契約書"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">種別</span>
          <select
            name="documentType"
            defaultValue={v.documentType}
            required
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">有効期限 (任意)</span>
          <input
            type="date"
            name="expiresOn"
            defaultValue={v.expiresOn}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">ファイル</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,image/png,image/jpeg,image/heic"
            required
            className="text-sm"
          />
          <span className="text-xs text-slate-500">PDF / PNG / JPEG / HEIC, 5 MB まで</span>
        </label>
        {trainingOptions.length > 0 && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-600">研修記録に紐付ける (任意)</span>
            <select
              name="trainingRecordId"
              defaultValue={v.trainingRecordId}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">未紐付け</option>
              {trainingOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              修了証として研修記録に紐付ける場合に選択してください
            </span>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600">メモ (任意)</span>
          <textarea
            name="notes"
            defaultValue={v.notes}
            maxLength={500}
            rows={2}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "アップロード中…" : "アップロード"}
        </button>
      </div>
    </form>
  );
}
