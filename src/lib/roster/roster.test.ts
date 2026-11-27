import { describe, expect, it } from "vitest";

import { ageOn, filterRoster, groupByOffice, type RosterEmployee } from "./filter";
import { renderRosterHtml } from "./html";
import {
  addMonths,
  DEFAULT_COLUMNS,
  describeRosterQuery,
  parseRosterQuery,
  presetSearch,
  ROSTER_PRESETS,
  rosterQueryToSearch,
} from "./query";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const emp = (code: string, over: Partial<RosterEmployee> = {}): RosterEmployee => ({
  id: code,
  employeeCode: code,
  lastName: "試験",
  firstName: code,
  lastNameKana: "シケン",
  firstNameKana: code,
  birthDate: null,
  gender: null,
  officeId: "o1",
  officeName: "第一拠点",
  officeOrder: 0,
  jobCategory: "CARE_WORKER",
  employmentType: "FULL_TIME",
  employmentStatus: "ACTIVE",
  joinedAt: null,
  ...over,
});

const TODAY = "2026-11-27";
const q = (sp: Record<string, string | string[]> = {}) =>
  parseRosterQuery({ submitted: "1", cols: DEFAULT_COLUMNS, ...sp }, TODAY);
const codes = (rows: RosterEmployee[]) => rows.map((r) => r.employeeCode);

describe("ageOn", () => {
  it("誕生日の当日に 1 つ増える", () => {
    expect(ageOn(d("1990-11-27"), d("2026-11-26"))).toBe(35);
    expect(ageOn(d("1990-11-27"), d("2026-11-27"))).toBe(36);
  });
  it("2/29 生まれは平年 3/1 に増える", () => {
    expect(ageOn(d("2000-02-29"), d("2025-02-28"))).toBe(24);
    expect(ageOn(d("2000-02-29"), d("2025-03-01"))).toBe(25);
  });
});

describe("parseRosterQuery", () => {
  it("初めて開いたときは既定の項目・今日の基準日", () => {
    const r = parseRosterQuery({}, TODAY);
    expect(r.columns).toEqual(DEFAULT_COLUMNS);
    expect(r.refDate).toBe(TODAY);
    expect(r.nightFrom).toBe("2026-05-27");
    expect(r.title).toBe("名簿");
  });
  it("送信後に項目を全部外したら項目なし", () => {
    expect(parseRosterQuery({ submitted: "1" }, TODAY).columns).toEqual([]);
  });
  it("不正な値は捨てる", () => {
    const r = parseRosterQuery(
      { job: ["NURSE", "X"], ageMin: "abc", refDate: "2026-13-40", gender: "?" },
      TODAY,
    );
    expect(r.jobs).toEqual(["NURSE"]);
    expect(r.ageMin).toBeNull();
    expect(r.refDate).toBe(TODAY);
    expect(r.gender).toBeNull();
  });
  it("記入欄は読点・カンマで区切り 5 つまで", () => {
    expect(q({ blanks: "接種日、サイン,備考，a、b、c" }).blanks).toEqual([
      "接種日",
      "サイン",
      "備考",
      "a",
      "b",
    ]);
  });
  it("クエリに戻して読み直すと同じ条件になる", () => {
    const a = q({
      title: "健診",
      office: ["o1", "o2"],
      type: "PART_TIME_INSURED",
      gender: "FEMALE",
      ageMin: "40",
      night: "1",
      cols: ["age", "birth"],
      blanks: "受診日、備考",
      orient: "landscape",
      breakByOffice: "1",
      sort: "kana",
    });
    const sp = new URLSearchParams(rosterQueryToSearch(a));
    const raw: Record<string, string[]> = {};
    for (const k of new Set(sp.keys())) raw[k] = sp.getAll(k);
    expect(parseRosterQuery(raw, TODAY)).toEqual(a);
  });
  it("ひな形のリンクは条件として読める", () => {
    const p = ROSTER_PRESETS.find((x) => x.key === "health-night")!;
    const sp = new URLSearchParams(presetSearch(p));
    const raw: Record<string, string[]> = {};
    for (const k of new Set(sp.keys())) raw[k] = sp.getAll(k);
    const r = parseRosterQuery(raw, TODAY);
    expect(r.nightOnly).toBe(true);
    expect(r.blanks).toEqual(["受診日", "受診先", "備考"]);
  });
  it("addMonths は月末を丸める", () => {
    expect(addMonths("2026-08-31", -6)).toBe("2026-02-28");
  });
});

describe("filterRoster", () => {
  const list = [
    emp("E1", { birthDate: d("1990-11-27"), gender: "FEMALE" }),
    emp("E2", { birthDate: d("1986-01-01"), gender: "MALE", officeId: "o2", officeOrder: 1 }),
    emp("E3", { employmentStatus: "ON_LEAVE" }),
    emp("E4", { employmentStatus: "RETIRED" }),
    emp("E5", { jobCategory: "NURSE", employmentType: "PART_TIME_UNINSURED" }),
  ];
  const none = new Set<string>();

  it("退職者は出さず、休職者は指定したときだけ", () => {
    expect(codes(filterRoster(list, q(), none).rows)).toEqual(["E1", "E5", "E2"]);
    expect(codes(filterRoster(list, q({ onLeave: "1" }), none).rows)).toContain("E3");
    expect(codes(filterRoster(list, q(), none).rows)).not.toContain("E3");
  });

  it("拠点・職種・雇用形態で絞る", () => {
    expect(codes(filterRoster(list, q({ office: "o2" }), none).rows)).toEqual(["E2"]);
    expect(codes(filterRoster(list, q({ job: "NURSE" }), none).rows)).toEqual(["E5"]);
    expect(codes(filterRoster(list, q({ type: "PART_TIME_UNINSURED" }), none).rows)).toEqual([
      "E5",
    ]);
  });

  it("年齢で絞り、生年月日が無い人は数える", () => {
    const r = filterRoster(list, q({ ageMin: "40" }), none);
    expect(codes(r.rows)).toEqual(["E2"]);
    expect(r.missingBirth).toBe(1); // E5 (E3 は休職なので先に外れる)
  });

  it("35歳ちょうど", () => {
    const r = filterRoster(list, q({ ageMin: "35", ageMax: "35", refDate: "2026-11-26" }), none);
    expect(codes(r.rows)).toEqual(["E1"]);
  });

  it("性別で絞り、性別が無い人は数える", () => {
    const r = filterRoster(list, q({ gender: "MALE" }), none);
    expect(codes(r.rows)).toEqual(["E2"]);
    expect(r.missingGender).toBe(1);
  });

  it("夜勤に入った人だけ", () => {
    expect(codes(filterRoster(list, q({ night: "1" }), new Set(["E2"])).rows)).toEqual(["E2"]);
  });

  it("拠点ごとに分ける", () => {
    const g = groupByOffice(filterRoster(list, q(), none).rows);
    expect(g.map((x) => x.rows.length)).toEqual([2, 1]);
  });
});

describe("describeRosterQuery / renderRosterHtml", () => {
  const offices = new Map([["o1", "第一拠点"]]);

  it("条件を文にする", () => {
    expect(describeRosterQuery(q({ office: "o1", ageMin: "40" }), offices)).toBe(
      "抽出条件: 拠点: 第一拠点 / 年齢: 40歳以上（2026/11/27 時点） / 在籍中",
    );
  });

  it("名前・タイトルはエスケープし、記入欄は空で出す", () => {
    const query = q({ title: "<健診>", blanks: "受診日" });
    const html = renderRosterHtml({
      query,
      rows: [emp("E1", { lastName: "<b>" })],
      conditionText: "",
      createdOn: TODAY,
    });
    expect(html).toContain("&lt;健診&gt;");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain('<th class="blank">受診日</th>');
    expect(html).toContain("<td></td></tr>");
  });

  it("拠点ごとに紙を分ける・よこ向き", () => {
    const query = q({ breakByOffice: "1", orient: "landscape" });
    const html = renderRosterHtml({
      query,
      rows: [emp("E1"), emp("E2", { officeId: "o2", officeName: "第二拠点" })],
      conditionText: "",
      createdOn: TODAY,
    });
    expect(html.match(/<section class="sheet">/g)).toHaveLength(2);
    expect(html).toContain("A4 landscape");
  });
});
