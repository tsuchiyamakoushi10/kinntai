/**
 * 月次勤務表 (S-A-08) の差分計算と、有休消化レコード同期の計画。
 *
 * UI のドラフト状態と DB の状態を比較し、saveShifts でまとめて適用する
 * upsert / delete のリストを作る。DB アクセスはここでは行わない。
 */

/** ドラフトおよび DB 上のセル 1 つを表す。 */
export type ShiftCell = {
  employeeId: string;
  /** `YYYY-MM-DD` */
  workDate: string;
  shiftPatternId: string;
  /**
   * このセルの勤務が属する事業所 ID。通常はグリッドの事業所。事業所またぎ (応援) 職員は
   * セルごとに応援先の officeId を持てる。officeId だけが変わっても upsert として検出する。
   */
  officeId: string;
  note: string | null;
};

export type ShiftKey = { employeeId: string; workDate: string };

export type ShiftDiff = {
  /** 新規 or 更新が必要なセル。 */
  upserts: ShiftCell[];
  /** 削除が必要なセル。 */
  deletes: ShiftKey[];
};

function keyOf(c: ShiftKey): string {
  return `${c.employeeId}:${c.workDate}`;
}

function cellEqual(a: ShiftCell, b: ShiftCell): boolean {
  return (
    a.shiftPatternId === b.shiftPatternId &&
    a.officeId === b.officeId &&
    (a.note ?? "") === (b.note ?? "")
  );
}

/**
 * baseline (DB の現在状態) と current (ユーザーのドラフト) を比較して、
 * 適用すべき upsert / delete を返す。
 *
 * - baseline にあって current に無い → delete
 * - current にあって baseline に無い → upsert
 * - 両方にあるが内容が違う → upsert
 * - 同一 → 何もしない
 */
export function computeShiftDiff(baseline: ShiftCell[], current: ShiftCell[]): ShiftDiff {
  const baselineMap = new Map<string, ShiftCell>();
  for (const c of baseline) baselineMap.set(keyOf(c), c);

  const upserts: ShiftCell[] = [];
  const seen = new Set<string>();
  for (const c of current) {
    const k = keyOf(c);
    seen.add(k);
    const prev = baselineMap.get(k);
    if (!prev || !cellEqual(prev, c)) {
      upserts.push(c);
    }
  }

  const deletes: ShiftKey[] = [];
  for (const c of baseline) {
    if (!seen.has(keyOf(c))) {
      deletes.push({ employeeId: c.employeeId, workDate: c.workDate });
    }
  }

  return { upserts, deletes };
}

/**
 * 有休消化レコード (paid_leave_consumptions) の同期計画。
 *
 * paid_leave_consumptions は `shift_id` を nullable FK で持ち、シフト削除時に
 * 自動 SetNull される。残骸が宙ぶらりんになるのを避けるため、シフト変更に
 * 合わせて手動で消化レコードも作り直す。
 *
 * 戻り値の `consumptionDeletes` は「対象 (employee_id, consumed_on) の既存
 * 消化レコードを全消し」する指示、`consumptionCreates` は新規作成する指示。
 * Save action 側はトランザクション内でこの順で適用する。
 */
export type ConsumptionPlan = {
  /** 既存消化レコードを (employee_id, consumed_on) 単位で削除する対象。 */
  consumptionDeletes: { employeeId: string; consumedOn: string }[];
  /** 新規作成する消化レコード。 */
  consumptionCreates: {
    employeeId: string;
    consumedOn: string;
    consumedDays: number;
  }[];
};

/**
 * diff から消化レコード同期計画を組み立てる。
 *
 * - upsert 対象セル全件: 旧レコードを消し、新パターンの paidLeaveUnits > 0 なら新規作成
 * - delete 対象セル全件: 旧レコードを消す（消化は紐付くシフトと一蓮托生）
 *
 * `patternUnits` はパターン ID → 有休消化単位 (Decimal を number 化したもの)。
 * グリッドにロードしたパターン一覧から作る。
 */
export function planConsumptions(
  diff: ShiftDiff,
  patternUnits: ReadonlyMap<string, number>,
): ConsumptionPlan {
  const consumptionDeletes: ConsumptionPlan["consumptionDeletes"] = [];
  const consumptionCreates: ConsumptionPlan["consumptionCreates"] = [];

  for (const u of diff.upserts) {
    consumptionDeletes.push({ employeeId: u.employeeId, consumedOn: u.workDate });
    const units = patternUnits.get(u.shiftPatternId) ?? 0;
    if (units > 0) {
      consumptionCreates.push({
        employeeId: u.employeeId,
        consumedOn: u.workDate,
        consumedDays: units,
      });
    }
  }
  for (const d of diff.deletes) {
    consumptionDeletes.push({ employeeId: d.employeeId, consumedOn: d.workDate });
  }

  return { consumptionDeletes, consumptionCreates };
}
