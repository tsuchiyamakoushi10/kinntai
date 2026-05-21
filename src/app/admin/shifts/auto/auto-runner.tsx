"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmRun, saveDraftRun, unconfirmRun } from "./actions";

type Props = {
  officeId: string;
  ym: string;
  seed: number;
  existingRunStatus: "DRAFT" | "CONFIRMED" | null;
  proposedCount: number;
};

export function AutoRunner({ officeId, ym, seed, existingRunStatus, proposedCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "success"; message: string } | { kind: "error"; message: string } | null
  >(null);

  function regenerate(): void {
    // seed を変えると別の配置が出る (dry-run のやり直し)
    const next = Math.floor(Math.random() * 0xffffffff);
    router.push(`/admin/shifts/auto?officeId=${officeId}&ym=${ym}&seed=${next}`);
  }

  function save(): void {
    setFeedback(null);
    if (existingRunStatus === "CONFIRMED") {
      setFeedback({
        kind: "error",
        message: "確定済の月です。先に確定取り消しを行ってください。",
      });
      return;
    }
    if (
      !window.confirm(
        `${proposedCount} 件のシフトを下書き保存します。\n既存の自動配置 (未編集分) は上書きされます。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await saveDraftRun({ officeId, ym, seed });
      if (r.ok) {
        setFeedback({
          kind: "success",
          message: `下書き保存しました (${r.proposedCount} 件)。S-A-08 で微調整できます。`,
        });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: r.error });
      }
    });
  }

  function confirm(): void {
    setFeedback(null);
    if (existingRunStatus !== "DRAFT") {
      setFeedback({ kind: "error", message: "下書きを先に保存してください。" });
      return;
    }
    if (!window.confirm("この月のシフトを確定します。よろしいですか？")) return;
    startTransition(async () => {
      const r = await confirmRun({ officeId, ym });
      if (r.ok) {
        setFeedback({ kind: "success", message: "確定しました。" });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: r.error });
      }
    });
  }

  function unconfirm(): void {
    setFeedback(null);
    if (existingRunStatus !== "CONFIRMED") {
      setFeedback({ kind: "error", message: "確定済ではありません。" });
      return;
    }
    if (!window.confirm("確定を取り消して下書き状態に戻します。よろしいですか？")) {
      return;
    }
    startTransition(async () => {
      const r = await unconfirmRun({ officeId, ym });
      if (r.ok) {
        setFeedback({ kind: "success", message: "確定を取り消しました。" });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: r.error });
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">操作</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          別の seed で再計算
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || existingRunStatus === "CONFIRMED"}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : "下書き保存"}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || existingRunStatus !== "DRAFT"}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          確定する
        </button>
        <button
          type="button"
          onClick={unconfirm}
          disabled={pending || existingRunStatus !== "CONFIRMED"}
          className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          確定取り消し
        </button>
        <Link
          href={`/admin/shifts?officeId=${officeId}&ym=${ym}`}
          className="text-sm text-slate-600 hover:underline"
        >
          S-A-08 勤務表で微調整 →
        </Link>
      </div>
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={
            feedback.kind === "error"
              ? "text-sm font-medium text-red-700"
              : "text-sm font-medium text-emerald-700"
          }
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}
