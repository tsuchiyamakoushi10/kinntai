/**
 * 事業所またぎ勤務: 勤務表セルの「勤務が属する事業所」を決める純関数。
 *
 * - 事業所固有記号 (patternOfficeId != null) → その事業所。
 * - 共通記号 → またぎ行 (勤務しうる事業所が複数) なら現在選択中の事業所 (既定 primary)、
 *   非またぎ行はグリッドの事業所。
 *
 * 返り値が spanned に含まれない不正な組合せは呼び出し側 (グリッド / 保存) で弾く。
 */
export function resolveCellOfficeId(args: {
  gridOfficeId: string;
  spannedOfficeIds: ReadonlyArray<string>;
  primaryOfficeId: string | null;
  patternOfficeId: string | null;
  currentOfficeId?: string;
}): string {
  const { gridOfficeId, spannedOfficeIds, primaryOfficeId, patternOfficeId, currentOfficeId } =
    args;
  if (patternOfficeId != null) return patternOfficeId;
  if (spannedOfficeIds.length > 1) {
    if (currentOfficeId && spannedOfficeIds.includes(currentOfficeId)) return currentOfficeId;
    return primaryOfficeId ?? gridOfficeId;
  }
  return gridOfficeId;
}
