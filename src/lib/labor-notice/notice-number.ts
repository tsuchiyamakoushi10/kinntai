/**
 * 通知書番号: `{接頭辞}-{発行年}-{連番4桁}` (年ごとに 1 から振り直す)。
 * void にした番号も欠番として残すため、採番は発行済み・void を含めた最大値 + 1。
 */
import { NOTICE_NO_PREFIX } from "./constants";

export function formatNoticeNo(
  year: number,
  seq: number,
  prefix: string = NOTICE_NO_PREFIX,
): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** 同じ年の既存番号から次の連番を返す。 */
export function nextNoticeSeq(
  existing: ReadonlyArray<string>,
  year: number,
  prefix: string = NOTICE_NO_PREFIX,
): number {
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const no of existing) {
    if (!no.startsWith(head)) continue;
    const n = Number(no.slice(head.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}
