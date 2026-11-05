"use client";

import { useActionState } from "react";

import {
  hideVoidLaborNotice,
  setLaborNoticeArchived,
  uploadSignedLaborNotice,
  voidLaborNotice,
  type SignedUploadState,
} from "../actions";

export function SignedUploadForm({ noticeId }: { noticeId: string }) {
  const [state, action, pending] = useActionState<SignedUploadState, FormData>(
    uploadSignedLaborNotice.bind(null, noticeId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-slate-700">本人が署名した3枚目を登録する</span>
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
          登録しました。
        </p>
      )}
    </form>
  );
}

export function VoidButton({ noticeId }: { noticeId: string }) {
  return (
    <form
      action={voidLaborNotice.bind(null, noticeId)}
      onSubmit={(e) => {
        if (!window.confirm("この通知書を無効にしますか？番号は欠番になり、元に戻せません。")) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        無効にする（作り直す）
      </button>
    </form>
  );
}

/** 「完了」フォルダへ移す / 「作業中」へ戻す */
export function ArchiveButton({
  noticeId,
  archived,
  small = false,
}: {
  noticeId: string;
  archived: boolean;
  small?: boolean;
}) {
  return (
    <form action={setLaborNoticeArchived.bind(null, noticeId, !archived)}>
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

/** 無効にした通知書を一覧から消す */
export function HideVoidButton({ noticeId, small = false }: { noticeId: string; small?: boolean }) {
  return (
    <form
      action={hideVoidLaborNotice.bind(null, noticeId)}
      onSubmit={(e) => {
        if (!window.confirm("この無効な通知書を一覧から消しますか？")) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className={`rounded-lg border border-red-300 bg-white font-semibold text-red-700 hover:bg-red-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
        }`}
      >
        消す
      </button>
    </form>
  );
}
