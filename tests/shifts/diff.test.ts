import { describe, expect, it } from "vitest";

import { computeShiftDiff, planConsumptions, type ShiftCell } from "@/lib/shifts/diff";

const E1 = "00000000-0000-0000-0000-000000000001";
const E2 = "00000000-0000-0000-0000-000000000002";
const P_DAY = "11111111-1111-1111-1111-111111111111";
const P_PAID = "22222222-2222-2222-2222-222222222222";
const P_AM_LEAVE = "33333333-3333-3333-3333-333333333333";

function cell(
  employeeId: string,
  workDate: string,
  shiftPatternId: string,
  note: string | null = null,
): ShiftCell {
  return { employeeId, workDate, shiftPatternId, note };
}

describe("computeShiftDiff", () => {
  it("空 vs 空 → 何もしない", () => {
    expect(computeShiftDiff([], [])).toEqual({ upserts: [], deletes: [] });
  });

  it("新規セルだけ → 全部 upsert", () => {
    const current = [cell(E1, "2026-05-01", P_DAY), cell(E1, "2026-05-02", P_DAY)];
    expect(computeShiftDiff([], current)).toEqual({ upserts: current, deletes: [] });
  });

  it("削除のみ → 全部 delete", () => {
    const baseline = [cell(E1, "2026-05-01", P_DAY)];
    expect(computeShiftDiff(baseline, [])).toEqual({
      upserts: [],
      deletes: [{ employeeId: E1, workDate: "2026-05-01" }],
    });
  });

  it("内容が同一なら upsert に入らない", () => {
    const baseline = [cell(E1, "2026-05-01", P_DAY)];
    const current = [cell(E1, "2026-05-01", P_DAY)];
    expect(computeShiftDiff(baseline, current)).toEqual({ upserts: [], deletes: [] });
  });

  it("パターン変更は upsert に入る", () => {
    const baseline = [cell(E1, "2026-05-01", P_DAY)];
    const current = [cell(E1, "2026-05-01", P_PAID)];
    const result = computeShiftDiff(baseline, current);
    expect(result.deletes).toEqual([]);
    expect(result.upserts).toEqual([cell(E1, "2026-05-01", P_PAID)]);
  });

  it("note 変更も upsert に入る", () => {
    const baseline = [cell(E1, "2026-05-01", P_DAY, null)];
    const current = [cell(E1, "2026-05-01", P_DAY, "応援")];
    expect(computeShiftDiff(baseline, current).upserts).toHaveLength(1);
  });

  it("複数従業員の追加/削除/維持を混在させても正しく分類する", () => {
    const baseline = [
      cell(E1, "2026-05-01", P_DAY), // 維持
      cell(E1, "2026-05-02", P_DAY), // 削除
      cell(E2, "2026-05-01", P_DAY), // 変更
    ];
    const current = [
      cell(E1, "2026-05-01", P_DAY), // 維持
      cell(E2, "2026-05-01", P_PAID), // 変更
      cell(E2, "2026-05-02", P_DAY), // 追加
    ];
    const result = computeShiftDiff(baseline, current);
    expect(result.upserts).toEqual([cell(E2, "2026-05-01", P_PAID), cell(E2, "2026-05-02", P_DAY)]);
    expect(result.deletes).toEqual([{ employeeId: E1, workDate: "2026-05-02" }]);
  });
});

describe("planConsumptions", () => {
  const units = new Map<string, number>([
    [P_DAY, 0],
    [P_PAID, 1.0],
    [P_AM_LEAVE, 0.5],
  ]);

  it("通常勤務の upsert は消化レコードを残骸クリアのみ（新規作成しない）", () => {
    const plan = planConsumptions({ upserts: [cell(E1, "2026-05-01", P_DAY)], deletes: [] }, units);
    expect(plan.consumptionDeletes).toEqual([{ employeeId: E1, consumedOn: "2026-05-01" }]);
    expect(plan.consumptionCreates).toEqual([]);
  });

  it("有休 upsert は 1.0 日分の消化レコードを新規作成", () => {
    const plan = planConsumptions(
      { upserts: [cell(E1, "2026-05-01", P_PAID)], deletes: [] },
      units,
    );
    expect(plan.consumptionCreates).toEqual([
      { employeeId: E1, consumedOn: "2026-05-01", consumedDays: 1.0 },
    ]);
  });

  it("複合パターン (有/日) は 0.5 日分の消化レコード", () => {
    const plan = planConsumptions(
      { upserts: [cell(E1, "2026-05-01", P_AM_LEAVE)], deletes: [] },
      units,
    );
    expect(plan.consumptionCreates).toEqual([
      { employeeId: E1, consumedOn: "2026-05-01", consumedDays: 0.5 },
    ]);
  });

  it("delete は消化レコードを消すだけ", () => {
    const plan = planConsumptions(
      { upserts: [], deletes: [{ employeeId: E1, workDate: "2026-05-01" }] },
      units,
    );
    expect(plan.consumptionDeletes).toEqual([{ employeeId: E1, consumedOn: "2026-05-01" }]);
    expect(plan.consumptionCreates).toEqual([]);
  });

  it("未知パターンは 0 扱い (消化なし)", () => {
    const unknown = "44444444-4444-4444-4444-444444444444";
    const plan = planConsumptions(
      { upserts: [cell(E1, "2026-05-01", unknown)], deletes: [] },
      units,
    );
    expect(plan.consumptionCreates).toEqual([]);
  });
});
