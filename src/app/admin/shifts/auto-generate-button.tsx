"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveDraftRun } from "./auto/actions";

type Props = {
  officeId: string;
  ym: string;
};

/**
 * 勤務表の上で「シフト自動生成」をその場実行するボタン。
 * サマリ画面 (/admin/shifts/auto) を経由せず、下書き保存まで一気に行い、
 * 成功したら router.refresh() で勤務表グリッドを埋め直す。
 * (グリッドは生成時刻 key で再マウントされる → page.tsx 側参照)
 */
export function AutoGenerateButton({ officeId, ym }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function run(): void {
    setMessage(null);
    if (
      !window.confirm(
        "この月のシフトを自動生成します。\n未編集の自動配置は上書きされます (手修正したセルは残ります)。",
      )
    ) {
      return;
    }
    startTransition(async () => {
      // seed は現行の生成器では未使用だが型を満たすために渡す。
      const res = await saveDraftRun({ officeId, ym, seed: Date.now() % 0xffffffff });
      if (res.ok) {
        setMessage({
          kind: "ok",
          text:
            res.warningCount > 0
              ? `自動生成しました (${res.proposedCount} 件・要確認 ${res.warningCount} 日)。`
              : `自動生成しました (${res.proposedCount} 件)。`,
        });
        // 勤務表グリッドに反映 (生成時刻が変わるのでグリッドが再マウントされる)
        router.refresh();
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "生成中…" : "シフト自動生成"}
      </button>
      {message && (
        <span
          role={message.kind === "err" ? "alert" : "status"}
          className={message.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
