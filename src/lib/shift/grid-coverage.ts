/**
 * 勤務表 (手編集グリッド) の「スタッフ不足」計算。
 *
 * 配置基準 (office_coverage_demands: 午前/午後/相談員/夜勤の必要数) と、現在グリッドに
 * 入っている配置から、日ごとの不足数を求める純粋関数。DB に触れない (クライアントで
 * セル編集のたびに再計算して下部アラートに使う)。
 */
import type { DayKind } from "@prisma/client";

/** 1 日種の必要数 (office_coverage_demands 由来)。 */
export type CoverageNeed = {
  am: number;
  pm: number;
  counselorAm: number;
  counselorPm: number;
  /** 午前のうち送迎(8:15開始)で必要な人数。0 = チェックしない。 */
  earlyAm: number;
  nightIn: number;
  nightOut: number;
};

/** グリッドの 1 セル分の配置情報 (未配置セルは渡さない)。 */
export type GridCell = {
  amCount: number;
  pmCount: number;
  isNightIn: boolean;
  isNightOut: boolean;
  isCounselor: boolean;
  /** 送迎 (8:15開始) か。 */
  isEarly: boolean;
};

/** 1 日分の不足 (各 >0 が不足人数。すべて 0 の日は結果に含めない)。 */
export type DayShortfall = {
  date: string;
  am: number;
  pm: number;
  earlyAm: number;
  nightIn: number;
  nightOut: number;
  counselorAm: number;
  counselorPm: number;
};

function isOperating(need: CoverageNeed): boolean {
  return need.am + need.pm + need.nightIn + need.nightOut > 0;
}

/**
 * 営業日ごとに必要数と在席数を比べ、不足のある日だけ返す。
 * 休業日 (必要数すべて 0、または日種の基準なし) は対象外。
 */
export function computeDayShortfalls(
  days: ReadonlyArray<{ date: string; dayKind: DayKind }>,
  demandByDayKind: Partial<Record<DayKind, CoverageNeed>>,
  cellsByDate: ReadonlyMap<string, ReadonlyArray<GridCell>>,
): DayShortfall[] {
  const out: DayShortfall[] = [];
  for (const d of days) {
    const need = demandByDayKind[d.dayKind];
    if (!need || !isOperating(need)) continue;

    let am = 0;
    let pm = 0;
    let early = 0;
    let nin = 0;
    let nout = 0;
    let cam = 0;
    let cpm = 0;
    for (const c of cellsByDate.get(d.date) ?? []) {
      am += c.amCount;
      pm += c.pmCount;
      if (c.isEarly && c.amCount > 0) early += 1;
      if (c.isNightIn) nin += 1;
      if (c.isNightOut) nout += 1;
      if (c.isCounselor) {
        cam += c.amCount;
        cpm += c.pmCount;
      }
    }

    const sf: DayShortfall = {
      date: d.date,
      am: Math.max(0, need.am - am),
      pm: Math.max(0, need.pm - pm),
      earlyAm: Math.max(0, need.earlyAm - early),
      nightIn: Math.max(0, need.nightIn - nin),
      nightOut: Math.max(0, need.nightOut - nout),
      counselorAm: Math.max(0, need.counselorAm - cam),
      counselorPm: Math.max(0, need.counselorPm - cpm),
    };
    if (
      sf.am ||
      sf.pm ||
      sf.earlyAm ||
      sf.nightIn ||
      sf.nightOut ||
      sf.counselorAm ||
      sf.counselorPm
    ) {
      out.push(sf);
    }
  }
  return out;
}
