"use client";

import { useActionState } from "react";

import {
  deleteRaiseNotice,
  setRaiseNoticeArchived,
  uploadSignedRaiseNotice,
  type RaiseSignedUploadState,
} from "../actions";

export function RaiseSignedUploadForm({ noticeId }: { noticeId: string }) {
  const [state, action, pending] = useActionState<RaiseSignedUploadState, FormData>(
    uploadSignedRaiseNotice.bind(null, noticeId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-slate-700">本人が署名した受領書を登録する</span>
      <input
        type="file"
        name="file"
        accept="application/pdf,image/png,image/jpeg,image/heic"
        capture="environment"
        required
        className="text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
      >
        {pending ? "登録中…" : "署名済みとして登録"}
      </button>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="text-emerald-700">
          登録しました。完了フォルダへ移しました。
        </p>
      )}
    </form>
  );
}

export function RaiseArchiveButton({
  noticeId,
  archived,
  small = false,
}: {
  noticeId: string;
  archived: boolean;
  small?: boolean;
}) {
  return (
    <form action={setRaiseNoticeArchived.bind(null, noticeId, !archived)}>
      <button
        type="submit"
        className={`rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
        }`}
      >
        {archived ? "作業中に戻す" : "完了フォルダへ移す"}
      </button>
    </form>
  );
}

export function RaiseDeleteButton({ noticeId }: { noticeId: string }) {
  return (
    <form
      action={deleteRaiseNotice.bind(null, noticeId)}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "この昇給通知を消しますか？\n書き換えた賃金データは元に戻りません。間違えた場合は、正しい金額でもう一度作ってください。",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        消す
      </button>
    </form>
  );
}
