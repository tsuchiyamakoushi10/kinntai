"use client";

import { Sprout, ArrowRight, TrendingUp } from "lucide-react";
import type { GrowthPath, GrowthStage } from "../types";
import { GROWTH_STAGES } from "../types";

interface Props {
  path: GrowthPath | null;
  emptyText?: string;
}

function stageInfo(stage: GrowthStage | null) {
  if (!stage) return null;
  return GROWTH_STAGES.find((s) => s.value === stage) ?? null;
}

export default function GrowthStageView({ path, emptyText }: Props) {
  if (!path) {
    return (
      <div className="card text-ink-400 py-8 text-center text-sm leading-relaxed">
        {emptyText ??
          "次のステップはまだ設定されていません。\n面談を通じて、一緒に考えていきましょう。"}
      </div>
    );
  }

  const current = stageInfo(path.currentStage);
  const next = stageInfo(path.nextStage);

  return (
    <div className="card from-sage-50 via-cream-50 to-warm-50 border-sage-100 overflow-hidden bg-gradient-to-br p-0">
      <div className="p-5">
        <div className="text-sage-600 mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.2em]">
          <TrendingUp className="h-3.5 w-3.5" />
          GROWTH NAVI
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {/* 今 */}
          <div className="border-sage-100 flex-1 rounded-2xl border bg-white/80 p-4">
            <div className="text-sage-600 mb-1 text-[10px] font-bold tracking-wider">
              いまのあなた
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-sage-100 text-sage-600 flex h-9 w-9 items-center justify-center rounded-xl">
                <Sprout className="h-4 w-4" />
              </div>
              <div>
                <div className="text-ink-800 font-bold">{current?.label ?? "—"}</div>
                <div className="text-ink-400 text-xs">{current?.description ?? ""}</div>
              </div>
            </div>
          </div>

          {/* 矢印 */}
          <div className="text-warm-400 flex items-center justify-center">
            <ArrowRight className="hidden h-6 w-6 sm:block" />
            <div className="text-ink-400 py-1 text-xs sm:hidden">↓</div>
          </div>

          {/* 次 */}
          <div className="border-warm-100 flex-1 rounded-2xl border bg-white/80 p-4">
            <div className="text-warm-600 mb-1 text-[10px] font-bold tracking-wider">
              次のステップ
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-warm-100 text-warm-600 flex h-9 w-9 items-center justify-center rounded-xl">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-ink-800 font-bold">{next?.label ?? "まだ設定なし"}</div>
                <div className="text-ink-400 text-xs">{next?.description ?? ""}</div>
              </div>
            </div>
          </div>
        </div>

        {path.aspirationNote && (
          <div className="border-cream-200 text-ink-800 mt-4 rounded-xl border bg-white/70 p-3 text-sm leading-relaxed">
            {path.aspirationNote}
          </div>
        )}
      </div>
    </div>
  );
}
