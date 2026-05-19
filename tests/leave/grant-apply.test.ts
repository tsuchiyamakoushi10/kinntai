import { describe, expect, it } from "vitest";

import { planGrantsForEmployee, type EmployeeContext } from "@/lib/leave/grant-apply";

const FT: EmployeeContext = {
  id: "e1",
  hiredOn: "2024-04-01",
  retiredOn: null,
  weeklyWorkDays: 5,
  weeklyWorkHours: 40,
};

describe("planGrantsForEmployee", () => {
  it("半年未満なら付与計画は空", () => {
    const plans = planGrantsForEmployee(FT, "2024-09-30", []);
    expect(plans).toEqual([]);
  });

  it("初回付与: 半年後ちょうどで 10 日付与、有効期限は 2 年後", () => {
    const plans = planGrantsForEmployee(FT, "2024-10-01", []);
    expect(plans).toEqual([
      {
        employeeId: "e1",
        grantedOn: "2024-10-01",
        expiresOn: "2026-10-01",
        grantedDays: 10,
        monthsSinceHired: 6,
      },
    ]);
  });

  it("3 年経過し未付与なら 3 回分まとめて発行", () => {
    const plans = planGrantsForEmployee(FT, "2027-10-01", []);
    expect(plans.map((p) => ({ on: p.grantedOn, days: p.grantedDays }))).toEqual([
      { on: "2024-10-01", days: 10 },
      { on: "2025-10-01", days: 11 },
      { on: "2026-10-01", days: 12 },
      { on: "2027-10-01", days: 14 },
    ]);
  });

  it("既付与分はスキップされる", () => {
    const plans = planGrantsForEmployee(FT, "2027-10-01", ["2024-10-01", "2025-10-01"]);
    expect(plans.map((p) => p.grantedOn)).toEqual(["2026-10-01", "2027-10-01"]);
  });

  it("退職済みなら退職日以降は付与しない", () => {
    const plans = planGrantsForEmployee({ ...FT, retiredOn: "2026-03-31" }, "2027-10-01", []);
    expect(plans.map((p) => p.grantedOn)).toEqual(["2024-10-01", "2025-10-01"]);
  });

  it("週 0 日勤務 (休職等) は付与なし", () => {
    const plans = planGrantsForEmployee({ ...FT, weeklyWorkDays: 0 }, "2027-10-01", []);
    expect(plans).toEqual([]);
  });

  it("パート (週 3 日・24h) は比例付与", () => {
    // asOf 2025-09-30 で 6 か月の初回付与のみ確認
    const plans = planGrantsForEmployee(
      { ...FT, weeklyWorkDays: 3, weeklyWorkHours: 24 },
      "2025-09-30",
      [],
    );
    expect(plans).toEqual([
      {
        employeeId: "e1",
        grantedOn: "2024-10-01",
        expiresOn: "2026-10-01",
        grantedDays: 5,
        monthsSinceHired: 6,
      },
    ]);
  });
});
