/**
 * "YYYY-MM-DD" (JST 業務日付) の文字列演算。Date は UTC 0 時として内部でのみ使う。
 */

function parse(ymd: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`invalid date: ${ymd}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const { y, m, d } = parse(ymd);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parse(ymd);
  return format(new Date(Date.UTC(y, m - 1, d + days)));
}

/**
 * 有期契約の終了日 (民法 143 条): 開始日から n か月後の応当日の前日。
 * 応当日がない月 (1/31 開始の 1 か月など) はその月の末日で満了する。
 */
export function fixedTermEndOn(startOn: string, months: number): string {
  const { y, m, d } = parse(startOn);
  const targetMonthIndex = m - 1 + months;
  const lastDayOfTarget = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
  if (d > lastDayOfTarget) {
    return format(new Date(Date.UTC(y, targetMonthIndex, lastDayOfTarget)));
  }
  return format(new Date(Date.UTC(y, targetMonthIndex, d - 1)));
}

/** "2027年5月1日" */
export function formatJpDate(ymd: string): string {
  const { y, m, d } = parse(ymd);
  return `${y}年${m}月${d}日`;
}

/** "2027/5/1" */
export function formatSlashDate(ymd: string): string {
  const { y, m, d } = parse(ymd);
  return `${y}/${m}/${d}`;
}

/** 日付つき設定配列から、基準日時点で有効な行を返す (effectiveFrom 昇順でなくてもよい)。 */
export function pickEffective<T extends { effectiveFrom: string }>(
  rows: ReadonlyArray<T>,
  onDate: string,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.effectiveFrom <= onDate && (best === null || row.effectiveFrom > best.effectiveFrom)) {
      best = row;
    }
  }
  return best;
}
