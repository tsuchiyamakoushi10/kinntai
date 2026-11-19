import { describe, expect, it } from "vitest";

import { normalizeSort, sortEmployees, type SortableEmployee } from "./employee-list-sort";

const e = (code: string, over: Partial<SortableEmployee> = {}): SortableEmployee => ({
  employeeCode: code,
  lastName: "テスト",
  firstName: code,
  lastNameKana: null,
  firstNameKana: null,
  jobCategory: null,
  employmentType: null,
  employmentStatus: "ACTIVE",
  joinedAt: null,
  officeOrder: null,
  ...over,
});

const codes = (l: SortableEmployee[]) => l.map((x) => x.employeeCode);

describe("sortEmployees", () => {
  const list = [
    e("E0003", {
      lastNameKana: "ヤマダ",
      firstNameKana: "ハナコ",
      officeOrder: 1,
      joinedAt: new Date("2020-04-01"),
    }),
    e("E0001", {
      lastNameKana: "アオキ",
      firstNameKana: "タロウ",
      officeOrder: 0,
      joinedAt: new Date("2024-04-01"),
    }),
    e("E0002", {
      lastNameKana: "カトウ",
      firstNameKana: "ジロウ",
      officeOrder: null,
      joinedAt: null,
    }),
  ];

  it("名前順 (フリガナの五十音)", () => {
    expect(codes(sortEmployees(list, "kana", "asc"))).toEqual(["E0001", "E0002", "E0003"]);
    expect(codes(sortEmployees(list, "kana", "desc"))).toEqual(["E0003", "E0002", "E0001"]);
  });

  it("社員番号順", () => {
    expect(codes(sortEmployees(list, "code", "asc"))).toEqual(["E0001", "E0002", "E0003"]);
  });

  it("拠点・入社日は、値が無い人を昇順でも降順でも最後にする", () => {
    expect(codes(sortEmployees(list, "office", "asc"))).toEqual(["E0001", "E0003", "E0002"]);
    expect(codes(sortEmployees(list, "office", "desc"))).toEqual(["E0003", "E0001", "E0002"]);
    expect(codes(sortEmployees(list, "joined", "asc"))).toEqual(["E0003", "E0001", "E0002"]);
    expect(codes(sortEmployees(list, "joined", "desc"))).toEqual(["E0001", "E0003", "E0002"]);
  });

  it("同じ値の中は名前順", () => {
    const same = [
      e("E0009", { lastNameKana: "ワダ", jobCategory: "NURSE" }),
      e("E0008", { lastNameKana: "イトウ", jobCategory: "NURSE" }),
      e("E0007", { lastNameKana: "ウエノ", jobCategory: "CARE_WORKER" }),
    ];
    expect(codes(sortEmployees(same, "job", "asc"))).toEqual(["E0007", "E0008", "E0009"]);
  });

  it("フリガナ未入力なら漢字の氏名で並べる", () => {
    const l = [e("E1", { lastName: "鈴木" }), e("E2", { lastNameKana: "アイダ" })];
    expect(codes(sortEmployees(l, "kana", "asc"))[0]).toBe("E2");
  });
});

describe("normalizeSort", () => {
  it("知らない値は社員番号の昇順", () => {
    expect(normalizeSort("xxx", "yyy")).toEqual({ sort: "code", dir: "asc" });
    expect(normalizeSort("kana", "desc")).toEqual({ sort: "kana", dir: "desc" });
  });
});
