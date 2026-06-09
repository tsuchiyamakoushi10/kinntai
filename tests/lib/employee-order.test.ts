import { describe, expect, it } from "vitest";

import { isRegularEmployment } from "@/lib/employee-labels";
import { compareForRoster, sortForRoster, type RosterSortable } from "@/lib/employee-order";

const emp = (
  employeeCode: string,
  employmentType: RosterSortable["employmentType"],
  displayOrder = 0,
): RosterSortable => ({ employeeCode, employmentType, displayOrder });

describe("compareForRoster / sortForRoster", () => {
  it("display_order が全員 0 なら 正社員 → 社保あり → 社保なし の順", () => {
    const list = [
      emp("E03", "PART_TIME_UNINSURED"),
      emp("E02", "PART_TIME_INSURED"),
      emp("E01", "FULL_TIME"),
    ];
    expect(sortForRoster(list).map((e) => e.employeeCode)).toEqual(["E01", "E02", "E03"]);
  });

  it("同じ雇用形態の中は社員コード昇順", () => {
    const list = [emp("E05", "FULL_TIME"), emp("E02", "FULL_TIME"), emp("E09", "FULL_TIME")];
    expect(sortForRoster(list).map((e) => e.employeeCode)).toEqual(["E02", "E05", "E09"]);
  });

  it("雇用形態 null は最後", () => {
    const list = [emp("E01", null), emp("E02", "PART_TIME_UNINSURED"), emp("E03", "FULL_TIME")];
    expect(sortForRoster(list).map((e) => e.employeeCode)).toEqual(["E03", "E02", "E01"]);
  });

  it("display_order が設定されていれば雇用形態より優先される", () => {
    const list = [
      emp("E01", "FULL_TIME", 30),
      emp("E02", "PART_TIME_UNINSURED", 10),
      emp("E03", "PART_TIME_INSURED", 20),
    ];
    expect(sortForRoster(list).map((e) => e.employeeCode)).toEqual(["E02", "E03", "E01"]);
  });

  it("compareForRoster は比較関数として 0 / 正 / 負 を返す", () => {
    expect(compareForRoster(emp("E01", "FULL_TIME"), emp("E02", "FULL_TIME"))).toBeLessThan(0);
    expect(compareForRoster(emp("E02", "FULL_TIME"), emp("E01", "FULL_TIME"))).toBeGreaterThan(0);
  });
});

describe("isRegularEmployment", () => {
  it("正社員・パート(社保あり)は常勤扱い", () => {
    expect(isRegularEmployment("FULL_TIME")).toBe(true);
    expect(isRegularEmployment("PART_TIME_INSURED")).toBe(true);
  });

  it("パート(社保なし)・未設定は常勤扱いでない", () => {
    expect(isRegularEmployment("PART_TIME_UNINSURED")).toBe(false);
    expect(isRegularEmployment(null)).toBe(false);
  });
});
