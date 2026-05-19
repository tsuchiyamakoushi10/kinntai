/**
 * 労基法準拠の有給付与日数計算 (S-A-11 / S-E-05 の基盤)。
 *
 * 労働基準法 第 39 条:
 *  - 雇い入れ日から 6 か月勤続で初回付与
 *  - 出勤率 80% 以上が条件 (本実装では呼び出し側で別途チェック)
 *  - 週所定労働日数 4 日以下 かつ 週所定労働時間 30 時間未満 → 比例付与
 *  - それ以外 → 通常付与 (フルタイム)
 *
 * 表は厚生労働省パンフレット「年次有給休暇取扱いについて」に基づく。
 * 法令変更があれば本ファイルの定数のみ修正する想定。
 */

/** 勤続年数バケット (年単位)。0 は 0.5 年 (6 か月) を表す。 */
export const TENURE_YEARS = [0, 1, 2, 3, 4, 5, 6] as const;
export type TenureBucketIdx = (typeof TENURE_YEARS)[number];

/** フルタイム (週所定 5 日以上 または 週 30 時間以上) の付与日数表。 */
export const FULL_TIME_GRANT_DAYS: readonly number[] = [10, 11, 12, 14, 16, 18, 20];

/**
 * 比例付与表。row=週所定労働日数 (1〜4)、col=勤続年数バケット (0..6)。
 * 週 0 日 / 5 日以上は本表の対象外 (前者は付与なし、後者はフルタイム表)。
 */
export const PROPORTIONAL_GRANT_DAYS: Readonly<Record<1 | 2 | 3 | 4, readonly number[]>> = {
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

/**
 * 比例付与の対象判定。労基法施行規則 第 24 条の 3 第 1 項。
 *  - 週所定労働日数が 4 日以下、かつ
 *  - 週所定労働時間が 30 時間未満
 */
export function isProportional(weeklyWorkDays: number, weeklyWorkHours: number): boolean {
  return weeklyWorkDays <= 4 && weeklyWorkHours < 30;
}

/**
 * 経過月数から勤続年数バケットを引く。
 *  - 6 か月未満 → null (まだ初回付与なし)
 *  - 6〜17 か月 → 0 (初回付与)
 *  - 18〜29 か月 → 1
 *  - 以降 12 か月ごとに 1 ずつ繰り上がり、6 で頭打ち
 */
export function tenureBucket(monthsSinceHired: number): TenureBucketIdx | null {
  if (monthsSinceHired < 6) return null;
  const idx = Math.floor((monthsSinceHired - 6) / 12);
  return Math.min(idx, 6) as TenureBucketIdx;
}

export type ComputeGrantInput = {
  /** 雇い入れからの経過月数 (整数で渡す。半月切り上げ等は呼び出し側で) */
  monthsSinceHired: number;
  /** 週所定労働日数 (0〜7、小数可) */
  weeklyWorkDays: number;
  /** 週所定労働時間 */
  weeklyWorkHours: number;
};

/**
 * 経過月数と勤務形態から付与日数を返す。0 なら付与なし (期間未到達など)。
 *
 * 週所定 0 日は付与なし。
 * 5 日以上 or 週 30h 以上はフルタイム表。
 * それ以外は比例付与表 (週日数を floor で 1〜4 にクランプ)。
 */
export function computeGrantDays(input: ComputeGrantInput): number {
  const bucket = tenureBucket(input.monthsSinceHired);
  if (bucket === null) return 0;
  if (input.weeklyWorkDays <= 0) return 0;

  if (!isProportional(input.weeklyWorkDays, input.weeklyWorkHours)) {
    return FULL_TIME_GRANT_DAYS[bucket] ?? 0;
  }

  // 比例付与: 週日数を 1〜4 の整数に。週 1 日未満は 1 日扱い (最低保障)。
  const days = Math.min(4, Math.max(1, Math.floor(input.weeklyWorkDays))) as 1 | 2 | 3 | 4;
  return PROPORTIONAL_GRANT_DAYS[days][bucket] ?? 0;
}
