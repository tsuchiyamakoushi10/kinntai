"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  closeTrainingSurvey,
  deleteTrainingSurvey,
  openTrainingSurvey,
  reopenTrainingSurvey,
} from "../actions";

type Props = { surveyId: string; status: "DRAFT" | "OPEN" | "CLOSED"; targetCount: number };

const primary =
  "rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400";
const sub =
  "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";

export function SurveyControls({ surveyId, status, targetCount }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "DRAFT" && (
        <button
          type="button"
          disabled={pending}
          className={primary}
          onClick={() => {
            if (!window.confirm(`${targetCount}人のマイページに配信しますか？`)) return;
            setError(null);
            start(async () => {
              const r = await openTrainingSurvey(surveyId);
              if (!r.ok) setError(r.error);
              router.refresh();
            });
          }}
        >
          配信する
        </button>
      )}
      {status === "OPEN" && (
        <button
          type="button"
          disabled={pending}
          className={sub}
          onClick={() => {
            if (!window.confirm("回答の受付を締め切りますか？（あとで再開できます）")) return;
            start(async () => {
              await closeTrainingSurvey(surveyId);
              router.refresh();
            });
          }}
        >
          締め切る
        </button>
      )}
      {status === "CLOSED" && (
        <button
          type="button"
          disabled={pending}
          className={sub}
          onClick={() =>
            start(async () => {
              await reopenTrainingSurvey(surveyId);
              router.refresh();
            })
          }
        >
          受付を再開する
        </button>
      )}
      {status === "DRAFT" && (
        <form
          action={deleteTrainingSurvey.bind(null, surveyId)}
          onSubmit={(e) => {
            if (!window.confirm("この下書きを削除しますか？")) e.preventDefault();
          }}
        >
          <button type="submit" className={`${sub} text-red-700`}>
            下書きを削除
          </button>
        </form>
      )}
      {error && (
        <span role="alert" className="text-sm font-medium text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
