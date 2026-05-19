/**
 * 年5日取得義務 (労基法 第 39 条第 7 項) のチェック。
 *
 * - 年 10 日以上の付与を受けた従業員に対し、使用者は付与日から 1 年以内に
 *   5 日を取得させなければならない。
 * - 取得日数のカウントは「その付与から消化された分」で行う (FIFO 割当)。
 *   古い付与のウィンドウ内に消化が発生しても、その消化が新しい付与から
 *   引かれたなら古い付与のカウントには入らない。
 * - 期限 (付与日 + 1 年) を過ぎてもなお 5 日未満なら違反。
 *
 * 入力は src/lib/leave/balance.ts と同じ型 (純粋データ) を使う。
 */

import { addYearsYmd } from "./schedule";
import type { ConsumptionInput, GrantInput } from "./balance";

/** 1 付与あたりの 5 日取得義務評価結果。 */
export type FiveDayStatus = {
  grantId: string;
  grantedOn: string;
  /** 5 日取得義務の期限 = grantedOn + 1 年。 */
  deadline: string;
  grantedDays: number;
  /** ウィンドウ内 (grantedOn 以上、deadline 未満) かつこの付与から取られた消化日数。 */
  consumedInWindow: number;
  /** あと何日取得が必要か (5 - consumedInWindow、負なら 0)。 */
  shortBy: number;
  /** asOf から deadline までの日数 (負なら超過)。 */
  daysLeft: number;
  /**
   *  - "ok": 5 日以上既に取得済み
   *  - "watch": 期限まで余裕あり (> 3 か月)
   *  - "warn": 期限が 3 か月以下に迫っている
   *  - "violated": 期限を過ぎて 5 日未達
   */
  severity: "ok" | "watch" | "warn" | "violated";
};

const WARN_DAYS = 90; // 3 か月

/** YYYY-MM-DD 同士の差 (日数)。a - b。 */
function diffDays(a: string, b: string): number {
  const ad = Date.parse(`${a}T00:00:00.000Z`);
  const bd = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((ad - bd) / (1000 * 60 * 60 * 24));
}

/**
 * 各付与について、FIFO 割当の結果として「その付与のウィンドウ内 + その付与から
 * 取られた」消化日数を集計する。
 */
function computeConsumedInWindow(
  grants: ReadonlyArray<GrantInput>,
  consumptions: ReadonlyArray<ConsumptionInput>,
): Map<string, number> {
  // FIFO は有効期限の昇順で
  const sortedGrants = [...grants].sort((a, b) => {
    if (a.expiresOn !== b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
    return a.grantedOn.localeCompare(b.grantedOn);
  });
  const sortedConsumptions = [...consumptions].sort((a, b) =>
    a.consumedOn.localeCompare(b.consumedOn),
  );

  const remaining = new Map<string, number>();
  const windowEnd = new Map<string, string>();
  const inWindow = new Map<string, number>();
  for (const g of sortedGrants) {
    remaining.set(g.id, g.grantedDays);
    windowEnd.set(g.id, addYearsYmd(g.grantedOn, 1));
    inWindow.set(g.id, 0);
  }

  for (const c of sortedConsumptions) {
    let need = c.consumedDays;
    if (need <= 0) continue;
    for (const g of sortedGrants) {
      if (need <= 0) break;
      if (g.expiresOn <= c.consumedOn) continue;
      if (c.consumedOn < g.grantedOn) continue;
      const left = remaining.get(g.id) ?? 0;
      if (left <= 0) continue;
      const take = Math.min(left, need);
      remaining.set(g.id, left - take);
      need -= take;
      // ウィンドウ内 (grantedOn 以上、grantedOn + 1 年 未満) かを判定
      const end = windowEnd.get(g.id);
      if (end && c.consumedOn < end) {
        inWindow.set(g.id, (inWindow.get(g.id) ?? 0) + take);
      }
    }
  }
  return inWindow;
}

/**
 * 年5日取得義務の対象付与 (10 日以上、付与済み) ごとの状況を返す。
 *
 * `asOf` 以前に付与された分のみを対象とする (未来の付与は除外)。
 * severity が "ok" のものも含めて返す。UI 側でフィルタする。
 */
export function evaluateFiveDayRule(
  grants: ReadonlyArray<GrantInput>,
  consumptions: ReadonlyArray<ConsumptionInput>,
  asOf: string,
): FiveDayStatus[] {
  const consumed = computeConsumedInWindow(grants, consumptions);
  const result: FiveDayStatus[] = [];

  for (const g of grants) {
    if (g.grantedDays < 10) continue;
    if (g.grantedOn > asOf) continue;

    const deadline = addYearsYmd(g.grantedOn, 1);
    const inWindow = consumed.get(g.id) ?? 0;
    const shortBy = Math.max(0, 5 - inWindow);
    const daysLeft = diffDays(deadline, asOf);

    let severity: FiveDayStatus["severity"];
    if (shortBy === 0) severity = "ok";
    else if (daysLeft <= 0) severity = "violated";
    else if (daysLeft <= WARN_DAYS) severity = "warn";
    else severity = "watch";

    result.push({
      grantId: g.id,
      grantedOn: g.grantedOn,
      deadline,
      grantedDays: g.grantedDays,
      consumedInWindow: inWindow,
      shortBy,
      daysLeft,
      severity,
    });
  }
  return result;
}
