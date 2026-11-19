"use client";

/**
 * 育成面談・人事考課の入力フォーム共通。
 * - 送信しても入力欄をリセットしない (長文を書くため。React 19 の form action は送信後にリセットする)
 * - どのボタンで送ったか (name="intent") を FormData に入れる
 * - 結果 (保存しました / エラー) をフォームの上に出す
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import type { GrowthActionResult } from "@/lib/growth/actions";

type Props = {
  action: (fd: FormData) => Promise<GrowthActionResult>;
  children: ReactNode;
  className?: string;
};

export function GrowthForm({ action, children, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GrowthActionResult | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className ?? "flex flex-col gap-4"}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.dataset.confirm && !window.confirm(submitter.dataset.confirm)) return;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(async () => {
          const r = await action(fd);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <ResultMessage result={result} pending={pending} />
    </form>
  );
}

export function ResultMessage({
  result,
  pending,
}: {
  result: GrowthActionResult | null;
  pending: boolean;
}) {
  if (pending) return <p className="text-sm text-slate-500">保存しています…</p>;
  if (!result) return null;
  return result.ok ? (
    <p
      role="status"
      className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
    >
      {result.message ?? "保存しました。"}
    </p>
  ) : (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {result.error}
    </p>
  );
}

/** 1 回押すだけの操作 (削除・確定の取り消しなど)。confirm を渡すと確認を出す */
export function ActionButton({
  action,
  label,
  confirm,
  variant = "secondary",
  redirectTo,
}: {
  action: () => Promise<GrowthActionResult>;
  label: string;
  confirm?: string;
  variant?: "danger" | "secondary";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GrowthActionResult | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => {
            const r = await action();
            setResult(r);
            if (r.ok) {
              if (redirectTo) router.push(redirectTo);
              else router.refresh();
            }
          });
        }}
        className={
          variant === "danger"
            ? "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        }
      >
        {pending ? "…" : label}
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-xs text-red-700">
          {result.error}
        </span>
      )}
    </span>
  );
}
