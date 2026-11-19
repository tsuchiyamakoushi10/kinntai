import { describe, expect, it } from "vitest";

import {
  departmentFromOffice,
  employeeToStaff,
  employmentTypeToDb,
  splitName,
  statusToDb,
  type EmployeeRow,
} from "./mapping";

const row = (over: Partial<EmployeeRow> = {}): EmployeeRow => ({
  id: "e1",
  employeeCode: "1001",
  lastName: "山田",
  firstName: "花子",
  lastNameKana: "ヤマダ",
  firstNameKana: "ハナコ",
  jobCategory: "NURSE",
  employmentType: "PART_TIME_INSURED",
  nightShiftOnly: false,
  joinedAt: new Date("2024-04-01T00:00:00Z"),
  employmentStatus: "ACTIVE",
  retiredAt: null,
  officeName: "ナーシングホーム結いの心",
  userRole: "EMPLOYEE",
  userEmail: null,
  ...over,
});

describe("employeeToStaff", () => {
  it("従業員マスタから結いナビの職員を作る", () => {
    const s = employeeToStaff(row(), {}, "2026-11-19");
    expect(s).toMatchObject({
      id: "e1",
      name: "山田 花子",
      furigana: "ヤマダ ハナコ",
      department: "ナーシングホーム結いの心 Honjo",
      jobType: "看護職員",
      employmentType: "パート",
      employmentStatus: "在籍中",
      joinedAt: "2024-04-01",
      role: "staff",
      active: true,
    });
  });

  it("勤次郎コードは結いナビ側の値 (社員番号は使わない)", () => {
    expect(employeeToStaff(row(), {}, "2026-11-19").kinjiroCode).toBeUndefined();
    expect(employeeToStaff(row(), { kinjiroCode: "A0123" }, "2026-11-19").kinjiroCode).toBe(
      "A0123",
    );
  });

  it("結いナビ側で決めた部署・職種・担当は従業員マスタより優先する", () => {
    const s = employeeToStaff(
      row(),
      { department: "本部", jobType: "事務", managerId: "m1" },
      "2026-11-19",
    );
    expect(s.department).toBe("本部");
    expect(s.jobType).toBe("事務");
    expect(s.managerId).toBe("m1");
  });

  it("在籍・退職・役割", () => {
    expect(employeeToStaff(row({ employmentStatus: "RETIRED" }), {}, "2026-11-19")).toMatchObject({
      employmentStatus: "退職済",
      active: false,
    });
    expect(
      employeeToStaff(row({ retiredAt: new Date("2026-12-31T00:00:00Z") }), {}, "2026-11-19")
        .employmentStatus,
    ).toBe("退職予定");
    expect(
      employeeToStaff(
        row({ employmentStatus: "ON_LEAVE" }),
        { employmentStatus: "産休・育休中" },
        "2026-11-19",
      ).employmentStatus,
    ).toBe("産休・育休中");
    expect(employeeToStaff(row({ userRole: "ADMIN" }), {}, "2026-11-19").role).toBe("president");
    expect(employeeToStaff(row({ userRole: "MANAGER" }), {}, "2026-11-19").role).toBe("manager");
    expect(employeeToStaff(row({ userRole: null }), { role: "manager" }, "2026-11-19").role).toBe(
      "manager",
    );
    expect(
      employeeToStaff(row({ nightShiftOnly: true, employmentType: "FULL_TIME" }), {}, "2026-11-19")
        .employmentType,
    ).toBe("夜勤専従");
  });
});

describe("書き戻し", () => {
  it("氏名を姓・名に分ける", () => {
    expect(splitName("山田 花子")).toEqual(["山田", "花子"]);
    expect(splitName("山田　花子")).toEqual(["山田", "花子"]);
    expect(splitName("山田")).toEqual(["山田", ""]);
  });

  it("在籍状況 → 従業員マスタ", () => {
    expect(statusToDb("退職済", "2026-10-31")).toEqual({
      employmentStatus: "RETIRED",
      retiredAt: new Date("2026-10-31T00:00:00Z"),
    });
    expect(statusToDb("産休・育休中", null)).toEqual({
      employmentStatus: "ON_LEAVE",
      retiredAt: null,
    });
    expect(statusToDb("在籍中", "2026-10-31")).toEqual({
      employmentStatus: "ACTIVE",
      retiredAt: null,
    });
  });

  it("雇用形態 → 従業員マスタ", () => {
    expect(employmentTypeToDb("夜勤専従")).toEqual({
      employmentType: "FULL_TIME",
      nightShiftOnly: true,
    });
    expect(employmentTypeToDb("パート").employmentType).toBe("PART_TIME_UNINSURED");
  });

  it("拠点名 → 部署", () => {
    expect(departmentFromOffice("ショートステイ結いの心")).toBe("ショートステイ結いの心");
    expect(departmentFromOffice("どこか")).toBeNull();
    expect(departmentFromOffice(null)).toBeNull();
  });
});
