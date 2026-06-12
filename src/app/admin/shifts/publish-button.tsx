"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { publishShifts, unpublishShifts } from "./actions";

type Props = {
  officeId: string;
  ym: string;
  /** 公開済みなら公開日時、未公開なら null。 */
  publishedAt: Date | null;
};

const PUBLISHED_AT_FMT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * 勤務表を職員に「公開 / 公開取消」するボタン。
 *
 * 公開済み = shift_publications に行があり、職員が /me/shifts でその月を閲覧できる状態。
 * 公開フラグは「見せるか」だけを制御するので、公開後の手修正は再公開不要で即反映される。
 * 取り違え防止に確認ダイアログを挟む (打刻画面ではないので確認 OK)。
 */
export function PublishButton({ officeId, ym, publishedAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPublished = publishedAt !== null;

  function publish(): void {
    setError(null);
    if (!window.confirm("この月のシフトを職員に公開します。よろしいですか？")) return;
    startTransition(async () => {
      const res = await publishShifts({ officeId, ym });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function unpublish(): void {
    setError(null);
    if (
      !window.confirm(
        "この月の公開を取り消します。職員からは再び見えなくなります。よろしいですか？",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await unpublishShifts({ officeId, ym });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {isPublished ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            公開済 {PUBLISHED_AT_FMT.format(publishedAt)}
          </span>
          <button
            type="button"
            onClick={unpublish}
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "処理中…" : "公開取消"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={publish}
          disabled={pending}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "公開中…" : "職員に公開"}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}
