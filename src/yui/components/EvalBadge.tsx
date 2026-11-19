"use client";

import type { EvalRank } from "../types";

interface Props {
  rank: EvalRank | null;
  size?: "md" | "lg";
}

const RANK_STYLES: Record<EvalRank, string> = {
  S: "bg-warm-500 text-white",
  A: "bg-warm-200 text-warm-600",
  B: "bg-sage-100 text-sage-600",
  C: "bg-cream-200 text-ink-600",
};

const SIZE_STYLES: Record<NonNullable<Props["size"]>, string> = {
  md: "w-8 h-8 text-sm",
  lg: "w-12 h-12 text-xl",
};

export default function EvalBadge({ rank, size = "md" }: Props) {
  const sizeClass = SIZE_STYLES[size];
  if (!rank) {
    return (
      <span
        className={`bg-cream-100 text-ink-400 inline-flex items-center justify-center rounded-full font-bold ${sizeClass}`}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${sizeClass} ${RANK_STYLES[rank]}`}
    >
      {rank}
    </span>
  );
}
