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

const YM_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
});

/** いまの JST 年月を `YYYY-MM` で返す。 */
export function currentJstYm(now: Date = new Date()): string {
  return YM_FORMATTER.format(now);
}

export type MonthRange = {
  /** `YYYY-MM` */
  ym: string;
  /** 月初 (JST 0 時) を UTC Date で。Prisma の Date 列クエリ用。 */
  start: Date;
  /** 翌月 1 日 (JST 0 時) を UTC Date で。range の上限 (exclusive)。 */
  end: Date;
  /** 月内の日付を `YYYY-MM-DD` で 1 日〜末日まで列挙したもの。 */
  days: ReadonlyArray<string>;
  /** 前月の `YYYY-MM`。 */
  prevYm: string;
  /** 翌月の `YYYY-MM`。 */
  nextYm: string;
};

/**
 * `YYYY-MM` を月全体の範囲・日リストに展開する。
 * フォーマット不正なら例外。月末日は `new Date(y, m, 0).getUTCDate()` で得る。
 */
export function monthRange(ym: string): MonthRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    throw new Error(`invalid YYYY-MM: ${ym}`);
  }
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${ym}-${String(d).padStart(2, "0")}`);
  }

  const start = fromJstYmd(`${ym}-01`);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextYm = `${nextY}-${String(nextM).padStart(2, "0")}`;
  const end = fromJstYmd(`${nextYm}-01`);

  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevYm = `${prevY}-${String(prevM).padStart(2, "0")}`;

  return { ym, start, end, days, prevYm, nextYm };
}
