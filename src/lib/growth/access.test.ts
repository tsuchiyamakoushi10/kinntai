import { describe, expect, it } from "vitest";

import { canAccessStaff } from "./logic";

describe("canAccessStaff", () => {
  const admin = { userId: "u0", role: "ADMIN" as const, employeeId: null };
  const mgr = { userId: "u1", role: "MANAGER" as const, employeeId: "m1" };
  const emp = { userId: "u2", role: "EMPLOYEE" as const, employeeId: "e1" };

  it("社長は全員", () => {
    expect(canAccessStaff(admin, { employeeId: "x", managerEmployeeId: null })).toBe(true);
  });
  it("部署の管理者は担当だけ", () => {
    expect(canAccessStaff(mgr, { employeeId: "x", managerEmployeeId: "m1" })).toBe(true);
    expect(canAccessStaff(mgr, { employeeId: "x", managerEmployeeId: "m2" })).toBe(false);
    expect(canAccessStaff(mgr, { employeeId: "x", managerEmployeeId: null })).toBe(false);
  });
  it("部署の管理者は自分自身を評価できない", () => {
    expect(canAccessStaff(mgr, { employeeId: "m1", managerEmployeeId: "m1" })).toBe(false);
  });
  it("従業員は誰も見られない", () => {
    expect(canAccessStaff(emp, { employeeId: "x", managerEmployeeId: "e1" })).toBe(false);
  });
});
