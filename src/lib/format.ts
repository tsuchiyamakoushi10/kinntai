/**
 * 日付・数値の表示フォーマッタ。Asia/Tokyo 固定。
 *
 * 業務日付は JST 基準で扱う（CLAUDE.md §3.2）ため、表示も Tokyo の暦に
 * 合わせて整形する。HTML の <input type="date"> 用の `YYYY-MM-DD` 出力も
 * 提供する。
 */
const TZ = "Asia/Tokyo";

const DATE_DISPLAY = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return DATE_DISPLAY.format(d);
}

/**
 * `<input type="date" value="...">` で受け付ける `YYYY-MM-DD` を JST 基準で出力する。
 */
export function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  // Intl で en-CA を使うと `YYYY-MM-DD` ハイフン区切りで返る。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * `<input type="date">` から来る `YYYY-MM-DD` を Date に戻す。
 *
 * @db.Date 列に格納されるため時刻成分は問わないが、TZ 跨ぎで前日に
 * ずれるのを防ぐため UTC 00:00 として扱う（PostgreSQL の DATE は
 * 時刻を保持しない）。
 */
export function parseDateInputValue(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 円表示。1230000 -> "1,230,000 円"
 */
export function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP")} 円`;
}
