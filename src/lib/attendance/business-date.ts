/**
 * 業務日付（JST 基準）の取り扱い。
 *
 * CLAUDE.md §3.2:
 *   - 日付の扱いは必ず Asia/Tokyo で統一
 *   - 夜勤の勤怠日付は「出勤した日」で集計
 *
 * サーバーが UTC で動いていても、出退勤の業務日付は JST 暦で判定する。
 * このモジュールはタイムゾーン変換を 1 箇所に閉じ込め、上位レイヤーは
 * `Date`（UTC タイムスタンプ）を渡すだけで済むようにする。
 */
const TZ = "Asia/Tokyo";

const YMD_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 渡された時刻が JST で何月何日にあたるかを `YYYY-MM-DD` で返す。
 * 例: UTC 2026-05-18T15:30:00Z → JST 2026-05-19 00:30 → "2026-05-19"
 */
export function toJstYmd(d: Date): string {
  return YMD_FORMATTER.format(d);
}

/**
 * `YYYY-MM-DD` を「その日 0 時 JST」の Date に戻す。
 *
 * PostgreSQL の `@db.Date` 列にこの Date を渡すと、Prisma は UTC 0 時として
 * 解釈して列の Date 値に変換する。Date 列は時刻を持たないため、TZ 跨ぎで
 * 1 日ずれないよう内部的には UTC 0 時として保存しておく。
 */
export function fromJstYmd(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  }
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * 「いま」の業務日付（JST 暦の日付）を `YYYY-MM-DD` で返す。
 * 出勤打刻時に attendance_records.work_date に流す値を生み出す入口。
 */
export function todayJstYmd(now: Date = new Date()): string {
  return toJstYmd(now);
}

/**
 * 業務日付を、Prisma の Date 列に渡せる Date オブジェクトとして返す。
 */
export function todayJstDate(now: Date = new Date()): Date {
  return fromJstYmd(todayJstYmd(now));
}
