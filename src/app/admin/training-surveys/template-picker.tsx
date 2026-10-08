"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteSurveyTemplate } from "./actions";

type Props = {
  templates: ReadonlyArray<{ id: string; name: string; count: number }>;
  selectedId: string | null;
};

/** 作成画面の上に出す「ひな形から作る」 */
export function TemplatePicker({ templates, selectedId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (templates.length === 0) {
    return (
      <p className="max-w-3xl rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        よく使う質問は、作成画面の「この質問をひな形として保存」で保存しておくと、次から選ぶだけで使えます。
      </p>
    );
  }
  return (
    <section className="flex max-w-3xl flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">ひな形から作る</h2>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/training-surveys/new"
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
            selectedId === null
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white"
          }`}
        >
          基本の質問
        </Link>
        {templates.map((t) => (
          <span
            key={t.id}
            className={`flex items-center rounded-full border text-sm font-semibold ${
              selectedId === t.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white"
            }`}
          >
            <Link
              href={`/admin/training-surveys/new?template=${t.id}`}
              className="py-1.5 pr-1 pl-3"
            >
              {t.name}
              <span className="ml-1 text-xs font-normal opacity-70">（{t.count}問）</span>
            </Link>
            <button
              type="button"
              disabled={pending}
              aria-label={`ひな形「${t.name}」を削除`}
              onClick={() => {
                if (!window.confirm(`ひな形「${t.name}」を削除しますか？`)) return;
                start(async () => {
                  await deleteSurveyTemplate(t.id);
                  router.replace("/admin/training-surveys/new");
                  router.refresh();
                });
              }}
              className="px-2 py-1.5 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        選ぶと質問がその内容に入れ替わります（研修名などはこのあと入力）。
      </p>
    </section>
  );
}
