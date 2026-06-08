/**
 * 午前/午後の配置カバレッジ (デイ等の配置基準を「午前◯名・午後◯名」で持つためのモデル)。
 *
 * docs/auto-shift-design-v2.md (案A) の追加要素。配置基準を「シフトパターン単位の人数」
 * ではなく「午前 / 午後の在席人数」で扱えるようにする。各勤務記号が午前 / 午後に
 * 何人分の在席を生むかは `勤務記号マスター_確定.csv` を唯一の正とする
 * (コードに直書きしない: 設計書 原則4)。
 *
 * 本モジュールは DB に触れない純粋関数。CSV テキストやマスターを引数で受け取る。
 */

/** 勤務記号マスターの 1 行 (基本記号ごとの午前/午後カウント等)。 */
export type SymbolCoverage = {
  /** 基本記号 (例: 日勤 / 半日A / 夜入)。接辞を剥がした後の記号。 */
  baseSymbol: string;
  /** 午前の在席カウント (0 / 1)。 */
  amCount: number;
  /** 午後の在席カウント (0 / 1)。 */
  pmCount: number;
  /** 夜勤系 (夜入 / 夜明) か。 */
  isNight: boolean;
  /** 時間帯区分 (終日 / 午前 / 午後 / 夜勤 / 夜勤明け / 厨房 / その他 / 休)。 */
  band: string;
};

/** 基本記号 → カバレッジ のマップ。 */
export type SymbolMaster = ReadonlyMap<string, SymbolCoverage>;

const EXPECTED_HEADER =
  "基本記号,開始,終了,時間帯区分,午前カウント,午後カウント,夜勤,想定事業所,備考";

/**
 * 勤務記号マスター CSV (テキスト) を SymbolMaster にパースする。
 *
 * - 先頭 BOM を除去する。
 * - ヘッダ行が想定と異なる場合は例外 (列順の事故を早期検知)。
 * - 数値列は整数として読む。空欄や非数は 0 とみなす。
 */
export function parseSymbolMaster(csvText: string): SymbolMaster {
  const text = csvText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    throw new Error("勤務記号マスターが空です。");
  }
  const header = lines[0]!.trim();
  if (header !== EXPECTED_HEADER) {
    throw new Error(`勤務記号マスターのヘッダが想定と異なります: ${header}`);
  }

  const map = new Map<string, SymbolCoverage>();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const baseSymbol = (cols[0] ?? "").trim();
    if (baseSymbol === "") continue;
    const band = (cols[3] ?? "").trim();
    const amCount = toInt(cols[4]);
    const pmCount = toInt(cols[5]);
    const isNight = toInt(cols[6]) === 1;
    map.set(baseSymbol, { baseSymbol, amCount, pmCount, isNight, band });
  }
  return map;
}

function toInt(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 1 日の割当 (誰が・どの基本記号か)。 */
export type DayAssignment = {
  employeeId: string;
  /** 基本記号 (接辞を剥がした後)。 */
  baseSymbol: string;
};

/** 午前 / 午後の在席人数。 */
export type Presence = { am: number; pm: number };

/**
 * 1 日の割当から午前 / 午後の在席人数を数える。
 * マスターに無い記号は在席 0 として無視する (休 / 厨房 / 不明記号は自然に除外)。
 */
export function countPresence(
  assignments: ReadonlyArray<DayAssignment>,
  master: SymbolMaster,
): Presence {
  let am = 0;
  let pm = 0;
  for (const a of assignments) {
    const c = master.get(a.baseSymbol);
    if (!c) continue;
    am += c.amCount;
    pm += c.pmCount;
  }
  return { am, pm };
}

/**
 * 相談員 (生活相談員) の午前 / 午後在席人数を数える。
 * 「午前・午後それぞれ 1 名以上」の充足判定に使う (職種は自動生成では強制しないため、チェック専用)。
 */
export function countCounselorPresence(
  assignments: ReadonlyArray<DayAssignment>,
  master: SymbolMaster,
  isCounselor: (employeeId: string) => boolean,
): Presence {
  return countPresence(
    assignments.filter((a) => isCounselor(a.employeeId)),
    master,
  );
}

/** 1 日の配置基準 (午前/午後の必要人数 + 相談員の午前/午後必要人数)。 */
export type CoverageDemand = {
  am: number;
  pm: number;
  /** 相談員の午前必要数 (デイ等は 1)。0 = チェックしない。 */
  counselorAm: number;
  /** 相談員の午後必要数。0 = チェックしない。 */
  counselorPm: number;
};

/** 1 日のカバレッジ評価結果 (不足は >0)。 */
export type CoverageResult = {
  presence: Presence;
  counselor: Presence;
  /** 午前の不足人数 (required - filled, 下限 0)。 */
  amShortfall: number;
  pmShortfall: number;
  /** 相談員の午前 / 午後が不足しているか。 */
  counselorAmShort: boolean;
  counselorPmShort: boolean;
};

/**
 * 1 日の割当を配置基準に照らして評価する。
 * 生成後・手修正後の両方で常時計算する想定 (設計書 §3 制約チェック)。
 */
export function evaluateCoverage(
  assignments: ReadonlyArray<DayAssignment>,
  master: SymbolMaster,
  demand: CoverageDemand,
  isCounselor: (employeeId: string) => boolean,
): CoverageResult {
  const presence = countPresence(assignments, master);
  const counselor = countCounselorPresence(assignments, master, isCounselor);
  return {
    presence,
    counselor,
    amShortfall: Math.max(0, demand.am - presence.am),
    pmShortfall: Math.max(0, demand.pm - presence.pm),
    counselorAmShort: demand.counselorAm > 0 && counselor.am < demand.counselorAm,
    counselorPmShort: demand.counselorPm > 0 && counselor.pm < demand.counselorPm,
  };
}
