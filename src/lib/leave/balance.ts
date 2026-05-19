/**
 * 有給残数の計算 (S-A-11 / S-E-05 のドメインロジック)。
 *
 * 仕様:
 *  - 古い付与から先に消化する FIFO
 *  - 付与日から 2 年で失効 (労基法 第 115 条)
 *  - 消化レコードは source_grant_id で割当先を持つが、本関数は割当の再計算も行う
 *
 * DB レイヤから読み込んだ付与 / 消化リストを渡すと、指定日時点での
 * 残数と、各付与ごとの残数・失効予定 (有効期限が早いものから順) を返す。
 *
 * 「指定日より前に消化されたが付与に紐付いていないレコード」は古い付与から
 * 順に消費したと仮定する。これにより source_grant_id が NULL のレコードや、
 * 削除された付与に紐付いていたレコードも整合的に扱える。
 */

export type GrantInput = {
  id: string;
  grantedOn: string; // YYYY-MM-DD
  expiresOn: string; // YYYY-MM-DD (付与 + 2 年が原則)
  grantedDays: number;
};

export type ConsumptionInput = {
  consumedOn: string; // YYYY-MM-DD
  consumedDays: number;
};

export type GrantBalance = {
  id: string;
  grantedOn: string;
  expiresOn: string;
  grantedDays: number;
  /** asOf 時点で残っている日数 (FIFO 割当後)。失効済みなら 0。 */
  remainingDays: number;
  /** asOf より後に失効するか (true: 有効、false: 失効済み) */
  active: boolean;
};

export type BalanceResult = {
  /** 全付与から失効・消化を引いた asOf 時点の総残数 */
  totalRemaining: number;
  /** 失効済み合計 (期限切れで消えた分) */
  totalExpired: number;
  /** 消化済み合計 */
  totalConsumed: number;
  /** 付与ごとの残数 (有効期限の昇順) */
  perGrant: GrantBalance[];
};

/**
 * asOf 時点の有給残数を計算する。
 *
 * アルゴリズム (有効期限の昇順で FIFO):
 *   1. 付与を expiresOn 昇順、tie-break で grantedOn 昇順に並べる
 *   2. 「asOf より前に失効した」付与は別バケットへ。残量を 0 にする
 *   3. 消化レコードを consumedOn 昇順に並べ、古い付与から順に引いていく
 *      - 消化日時点で既に失効した付与は引き対象から除外
 *   4. 残った付与 (active かつ remainingDays > 0) を有効期限順に返す
 */
export function computeBalance(
  grants: ReadonlyArray<GrantInput>,
  consumptions: ReadonlyArray<ConsumptionInput>,
  asOf: string,
): BalanceResult {
  // 浅いコピー + ソート
  const sortedGrants = [...grants].sort((a, b) => {
    if (a.expiresOn !== b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
    return a.grantedOn.localeCompare(b.grantedOn);
  });
  const sortedConsumptions = [...consumptions].sort((a, b) =>
    a.consumedOn.localeCompare(b.consumedOn),
  );

  // 各付与の残量を可変で持つ
  const remaining = new Map<string, number>();
  for (const g of sortedGrants) remaining.set(g.id, g.grantedDays);

  let totalExpired = 0;

  // 消化を古い順に当てていく
  for (const c of sortedConsumptions) {
    let need = c.consumedDays;
    if (need <= 0) continue;
    for (const g of sortedGrants) {
      if (need <= 0) break;
      // 消化日時点で失効済みは飛ばす (本来は失効後に消化が記録されないはずだが防御的に)
      if (g.expiresOn <= c.consumedOn) continue;
      // 付与日より前の消化は割り当て不可
      if (c.consumedOn < g.grantedOn) continue;
      const left = remaining.get(g.id) ?? 0;
      if (left <= 0) continue;
      const take = Math.min(left, need);
      remaining.set(g.id, left - take);
      need -= take;
    }
    // need > 0 のまま残った場合は、付与残が足りない / すべて失効済み等。
    // ここでは黙ってドロップする (UI 側で警告するかは別レイヤ)。
  }

  // 失効処理: asOf 時点で expiresOn を過ぎた付与の残量は totalExpired に積む
  let totalRemaining = 0;
  const perGrant: GrantBalance[] = [];
  for (const g of sortedGrants) {
    const left = remaining.get(g.id) ?? 0;
    const active = g.expiresOn > asOf;
    if (!active) {
      totalExpired += left;
      perGrant.push({
        id: g.id,
        grantedOn: g.grantedOn,
        expiresOn: g.expiresOn,
        grantedDays: g.grantedDays,
        remainingDays: 0,
        active: false,
      });
    } else {
      totalRemaining += left;
      perGrant.push({
        id: g.id,
        grantedOn: g.grantedOn,
        expiresOn: g.expiresOn,
        grantedDays: g.grantedDays,
        remainingDays: left,
        active: true,
      });
    }
  }

  const totalConsumed = consumptions.reduce(
    (s, c) => s + (c.consumedDays > 0 ? c.consumedDays : 0),
    0,
  );

  return { totalRemaining, totalExpired, totalConsumed, perGrant };
}
