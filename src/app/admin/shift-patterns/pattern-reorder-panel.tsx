"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveShiftPatternOrder } from "./actions";

export type ReorderPattern = {
  id: string;
  name: string;
  code: string;
  color: string;
  officeName: string;
};

type Props = {
  patterns: ReadonlyArray<ReorderPattern>;
};

/**
 * シフトパターンの表示順を ▲▼ で手動並べ替えする (職員の並べ替えと同じ操作)。
 * 「並べ替え」で開き、保存で sortOrder を更新する。開くたびに最新 prop から初期化。
 */
export function PatternReorderPanel({ patterns }: Props) {
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);

  function toggle(): void {
    setOpen((o) => {
      if (!o) setSeq((s) => s + 1);
      return !o;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        {open ? "並べ替えを閉じる" : "並べ替え"}
      </button>
      {open && <SortableList key={seq} initial={patterns} />}
    </div>
  );
}

function SortableList({ initial }: { initial: ReadonlyArray<ReorderPattern> }) {
  const router = useRouter();
  const [order, setOrder] = useState<ReorderPattern[]>(() => [...initial]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function move(index: number, dir: -1 | 1): void {
    setOrder((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const a = prev[index];
      const b = prev[target];
      if (a === undefined || b === undefined) return prev;
      const next = [...prev];
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function onSave(): void {
    setMessage(null);
    startTransition(async () => {
      const res = await saveShiftPatternOrder(order.map((p) => p.id));
      if (res.ok) {
        setMessage({ kind: "ok", text: "並び順を保存しました。" });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          ▲▼ で上下に動かし、「保存」で勤務表のパレット順・一覧順に反映します。
        </span>
        <div className="flex items-center gap-2">
          {message && (
            <span
              role={message.kind === "err" ? "alert" : "status"}
              className={
                message.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-rose-700"
              }
            >
              {message.text}
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
      <ol className="flex flex-col gap-1">
        {order.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5"
          >
            <span className="w-6 text-right text-xs text-slate-400">{i + 1}</span>
            <span
              aria-hidden
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 truncate text-sm text-slate-900">{p.name}</span>
            <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
            <span className="rounded-sm bg-slate-100 px-1.5 text-[11px] text-slate-600">
              {p.officeName}
            </span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="上へ"
              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label="下へ"
              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-30"
            >
              ▼
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
