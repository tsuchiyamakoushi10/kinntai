import { describe, expect, it } from "vitest";

import { mergeCrossOfficeBusyDays, type CrossOfficeShift } from "@/lib/shift/cross-office";

const A = "office-a";
const B = "office-b";
const C = "office-c";
const E1 = "emp-1";
const E2 = "emp-2";

function s(employeeId: string, officeId: string, workDate: string): CrossOfficeShift {
  return { employeeId, officeId, workDate };
}

describe("mergeCrossOfficeBusyDays", () => {
  it("別拠点の勤務日を従業員ごとに集約する", () => {
    const shifts = [s(E1, B, "2026-08-01"), s(E1, C, "2026-08-03")];
    const busy = mergeCrossOfficeBusyDays(shifts, A);
    expect([...(busy.get(E1) ?? [])].sort()).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("対象拠点 (自拠点) の日は無視する", () => {
    const shifts = [s(E1, A, "2026-08-01"), s(E1, B, "2026-08-02")];
    const busy = mergeCrossOfficeBusyDays(shifts, A);
    expect([...(busy.get(E1) ?? [])]).toEqual(["2026-08-02"]);
  });

  it("複数職員を分離して集約する", () => {
    const shifts = [s(E1, B, "2026-08-01"), s(E2, B, "2026-08-01"), s(E2, C, "2026-08-05")];
    const busy = mergeCrossOfficeBusyDays(shifts, A);
    expect([...(busy.get(E1) ?? [])]).toEqual(["2026-08-01"]);
    expect([...(busy.get(E2) ?? [])].sort()).toEqual(["2026-08-01", "2026-08-05"]);
  });

  it("該当なしなら空 Map", () => {
    const busy = mergeCrossOfficeBusyDays([s(E1, A, "2026-08-01")], A);
    expect(busy.size).toBe(0);
  });

  it("同じ日が複数拠点にあっても Set で重複しない", () => {
    const shifts = [s(E1, B, "2026-08-01"), s(E1, C, "2026-08-01")];
    const busy = mergeCrossOfficeBusyDays(shifts, A);
    expect([...(busy.get(E1) ?? [])]).toEqual(["2026-08-01"]);
  });
});
