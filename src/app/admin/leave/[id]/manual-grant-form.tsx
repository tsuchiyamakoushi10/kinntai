"use client";

import { useState, useTransition } from "react";

import { grantManual } from "../actions";

type Props = {
  employeeId: string;
  defaultDate: string; // YYYY-MM-DD
};

export function ManualGrantForm({ employeeId, defaultDate }: Props) {
  const [grantedOn, setGrantedOn] = useState(defaultDate);
  const [grantedDays, setGrantedDays] = useState("1");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(ev: React.FormEvent): void {
    ev.preventDefault();
    const days = Number(grantedDays);
    if (!Number.isFinite(days) || days <= 0) {
      setMessage({ kind: "err", text: "付与日数は 0 を超える値を入力してください。" });
      return;
    }
    startTransition(async () => {
      const res = await grantManual({
        employeeId,
        grantedOn,
        grantedDays: days,
        note,
      });
      if (res.ok) {
        setMessage({ kind: "ok", text: `付与しました (${days} 日)。` });
        setNote("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">付与日</span>
        <input
          type="date"
          value={grantedOn}
          onChange={(e) => setGrantedOn(e.target.value)}
          required
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">付与日数</span>
        <input
          type="number"
          step="0.5"
          min="0.5"
          max="40"
          value={grantedDays}
          onChange={(e) => setGrantedDays(e.target.value)}
          required
          className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">メモ (任意)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例: 入社時調整"
          maxLength={200}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "追加中…" : "付与を追加"}
      </button>
      {message && (
        <p
          className={
            message.kind === "ok"
              ? "w-full text-sm text-emerald-700"
              : "w-full text-sm text-rose-700"
          }
          role="status"
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
