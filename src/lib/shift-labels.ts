/**
 * ShiftKind の日本語表記。CLAUDE.md §2 のドメイン用語に合わせる。
 *
 * UI には「早番」「日勤」のような業務上の呼称をそのまま使うのではなく、
 * 仕組み上の種別 (通常勤務 / 夜入 / 夜明 / 公休 / 有休 / 欠勤 / 希望休) で
 * 揃える。具体的なパターン名 (「早」「デ日」など) は ShiftPattern.name 側で扱う。
 */
import type { ShiftKind } from "@prisma/client";

export const SHIFT_KIND_LABELS: Record<ShiftKind, string> = {
  WORK: "通常勤務",
  NIGHT_IN: "夜入 (夜勤前半)",
  NIGHT_OUT: "夜明 (夜勤後半)",
  OFF: "公休",
  PAID_LEAVE: "有休",
  ABSENCE: "欠勤",
  REQUESTED_OFF: "希望休",
};

export const SHIFT_KIND_OPTIONS: ReadonlyArray<{ value: ShiftKind; label: string }> = (
  Object.keys(SHIFT_KIND_LABELS) as ShiftKind[]
).map((v) => ({ value: v, label: SHIFT_KIND_LABELS[v] }));

/** 開始 / 終了時刻を持つべき種別か。 */
export function shiftKindHasTime(kind: ShiftKind): boolean {
  return kind === "WORK" || kind === "NIGHT_IN" || kind === "NIGHT_OUT";
}
