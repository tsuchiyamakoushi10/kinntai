/**
 * 梨花シフト表 (グリッド) の表示・集計ロジック。
 *
 * 設計書 §4: 縦軸=職員 / 横軸=その月の全日。下段に「午前人数 / 午後人数」の集計行、
 * 右端に各職員の勤務日数。配置基準に対する 不足 / 余剰 / 充足 を色で示す。
 *
 * 本モジュールは DB / React に依存しない純粋関数。集計が UI と独立にテストできる。
 */
import { RIKA_BUSINESS_DOW, RIKA_STAFFING, symbolDef, type RikaSymbolCode } from "./config";
import { holidayName, isHoliday } from "@/lib/calendar/holidays";
import { monthRange } from "@/lib/attendance/business-date";

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** グリッドの 1 日分のメタ情報。 */
export type RikaDay = {
  /** "YYYY-MM-DD" */
  date: string;
  /** 1..31 */
  day: number;
  /** 0=日 .. 6=土 */
  dow: number;
  /** 曜日ラベル (日..土)。 */
  dowLabel: string;
  /** 営業日か (RIKA_BUSINESS_DOW に含まれ、かつ祝日でない)。 */
  isBusinessDay: boolean;
  /** 祝日か。 */
  isHoliday: boolean;
  /** 祝日名 (なければ null)。 */
  holidayName: string | null;
};

/** 1 セル分の配置 (職員 × 日 × 勤務記号)。 */
export type RikaCell = {
  /** 職員の識別子 (プロトタイプでは氏名を使う)。 */
  memberId: string;
  /** "YYYY-MM-DD" */
  date: string;
  symbol: RikaSymbolCode;
};

/** その月のグリッド用 日リストを組み立てる。JST 基準。 */
export function buildRikaMonth(ym: string): RikaDay[] {
  const { days } = monthRange(ym);
  return days.map((date): RikaDay => {
    const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const holiday = isHoliday(date);
    return {
      date,
      day: Number(date.slice(8, 10)),
      dow,
      dowLabel: DOW_LABELS[dow]!,
      isBusinessDay: RIKA_BUSINESS_DOW.includes(dow) && !holiday,
      isHoliday: holiday,
      holidayName: holidayName(date),
    };
  });
}

/** ある日の 午前 / 午後 の頭数を集計する。 */
export function aggregateDay(
  cells: ReadonlyArray<RikaCell>,
  date: string,
): { am: number; pm: number } {
  let am = 0;
  let pm = 0;
  for (const c of cells) {
    if (c.date !== date) continue;
    const sym = symbolDef(c.symbol);
    am += sym.am;
    pm += sym.pm;
  }
  return { am, pm };
}

/** 配置基準に対する充足状況。 */
export type Coverage = "short" | "met" | "surplus";

/** 頭数 actual を必要数 required と比べて 不足 / 充足 / 余剰 を返す。 */
export function coverageOf(actual: number, required: number): Coverage {
  if (actual < required) return "short";
  if (actual > required) return "surplus";
  return "met";
}

/** ある日の午前・午後それぞれの充足状況 (営業日のみ意味を持つ)。 */
export function dayCoverage(
  cells: ReadonlyArray<RikaCell>,
  date: string,
): { am: Coverage; pm: Coverage; counts: { am: number; pm: number } } {
  const counts = aggregateDay(cells, date);
  return {
    counts,
    am: coverageOf(counts.am, RIKA_STAFFING.morning),
    pm: coverageOf(counts.pm, RIKA_STAFFING.afternoon),
  };
}

/** ある職員の勤務日数 (公・有・希望休などの休み系を除いた実働日数)。 */
export function countWorkdays(cells: ReadonlyArray<RikaCell>, memberId: string): number {
  let n = 0;
  for (const c of cells) {
    if (c.memberId !== memberId) continue;
    if (symbolDef(c.symbol).isOff) continue;
    n += 1;
  }
  return n;
}
