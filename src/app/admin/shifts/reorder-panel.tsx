"use client";

import type { EmploymentType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EMPLOYMENT_TYPE_LABELS } from "@/lib/employee-labels";

import { resetEmployeeOrder, saveEmployeeOrder } from "./actions";

export type ReorderEmployee = {
  id: string;
  name: string;
  employmentType: EmploymentType | null;
};

type Props = {
  officeId: string;
  employees: ReadonlyArray<ReorderEmployee>;
};

/**
 * 勤務表の従業員並び順を手動で変える UI。
 * 「並べ替え」トグルで開閉し、開くたびに最新の並び (employees prop) から初期化する
 * (seq を key にして内部リストを再マウント)。▲▼ で上下に動かし保存。
 */
export function ReorderPanel({ officeId, employees }: Props) {
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);

  function toggle(): void {
    setOpen((o) => {
      if (!o) setSeq((s) => s + 1); // 開くたびに最新 prop で再マウント
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
      {open && (
        <SortableList
          key={seq}
          officeId={officeId}
          initial={employees}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function SortableList({
  officeId,
  initial,
  onClose,
}: {
  officeId: string;
  initial: ReadonlyArray<ReorderEmployee>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<ReorderEmployee[]>(() => [...initial]);
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
      const res = await saveEmployeeOrder({
        officeId,
        orderedEmployeeIds: order.map((e) => e.id),
      });
      if (res.ok) {
        setMessage({ kind: "ok", text: "並び順を保存しました。" });
        router.refresh();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function onReset(): void {
    if (
      !window.confirm("手動の並び順を消して、雇用形態順（正社員→社保あり→社保なし）に戻します。")
    ) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await resetEmployeeOrder({ officeId });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          ▲▼ で上下に動かし、「保存」で勤務表の並び順を確定します。
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
            onClick={onReset}
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            雇用形態順にリセット
          </button>
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
        {order.map((e, i) => (
          <li
            key={e.id}
            className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5"
          >
            <span className="w-6 text-right text-xs text-slate-400">{i + 1}</span>
            <span className="flex-1 truncate text-sm text-slate-900">{e.name}</span>
            <span className="rounded-sm bg-slate-100 px-1.5 text-[11px] text-slate-600">
              {e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : "未設定"}
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
