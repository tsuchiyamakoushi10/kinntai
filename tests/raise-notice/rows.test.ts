import { describe, expect, it } from "vitest";

import { EMPLOYMENT_PRESETS } from "@/lib/labor-notice/constants";
import type { NoticeWageInput } from "@/lib/labor-notice/types";
import { renderRaiseDocument } from "@/lib/raise-notice/html";
import {
  applyRaiseToWage,
  checkRaise,
  monthlyTotals,
  parseRaiseInput,
  rowsFromPreviousRaise,
  rowsFromWage,
  visibleRows,
} from "@/lib/raise-notice/rows";
import type { RaiseInput, RaiseRow } from "@/lib/raise-notice/types";

const qualificationDefaults = EMPLOYMENT_PRESETS.FULL_TIME.qualificationAllowances;

const monthly: NoticeWageInput = {
  kind: "MONTHLY",
  baseYen: 200_000,
  qualification: "CARE_WORKER",
  qualificationAllowanceYen: 15_000,
  singleParentChildren: 0,
  managerAllowanceYen: 0,
  counselorAllowanceYen: 10_000,
};

const hourly: NoticeWageInput = {
  kind: "HOURLY",
  hourlyYen: 1_100,
  qualification: "NONE",
  worksNight: false,
};

function raise(rows: RaiseRow[], patch: Partial<RaiseInput> = {}): RaiseInput {
  return {
    issuedOn: "2027-03-15",
    effectiveOn: "2027-04-01",
    kind: "MONTHLY",
    rows,
    message: "",
    ...patch,
  };
}

describe("rowsFromWage", () => {
  it("月給: 基本給・資格手当・管理者手当・相談員手当の行を、今の金額で作る", () => {
    const rows = rowsFromWage(monthly, qualificationDefaults);
    expect(rows.map((r) => [r.key, r.label, r.beforeYen, r.afterYen])).toEqual([
      ["BASE", "基本給", 200_000, 200_000],
      ["QUALIFICATION", "資格手当（介護福祉士）", 15_000, 15_000],
      ["MANAGER", "管理者手当", 0, 0],
      ["COUNSELOR", "相談員手当", 10_000, 10_000],
    ]);
  });
  it("資格手当が未指定ならマスタの既定額を使う", () => {
    const rows = rowsFromWage(
      { ...monthly, qualificationAllowanceYen: null },
      {
        ...qualificationDefaults,
        CARE_WORKER: 12_000,
      },
    );
    expect(rows.find((r) => r.key === "QUALIFICATION")?.beforeYen).toBe(12_000);
  });
  it("時給: 資格なしなら時給の行だけ", () => {
    const rows = rowsFromWage(hourly, qualificationDefaults);
    expect(rows).toEqual([
      { key: "BASE", label: "時給", unit: "HOUR", beforeYen: 1_100, afterYen: 1_100 },
    ]);
  });
});

describe("checkRaise", () => {
  it("金額が変わっていなければ発行できない", () => {
    const rows = rowsFromWage(monthly, qualificationDefaults);
    expect(checkRaise(raise(rows)).errors).toContain(
      "金額が変わっていません。変更後の金額を入力してください",
    );
  });
  it("基本給を上げれば問題なし。下がった行は警告", () => {
    const rows = rowsFromWage(monthly, qualificationDefaults).map((r) =>
      r.key === "BASE"
        ? { ...r, afterYen: 205_000 }
        : r.key === "COUNSELOR"
          ? { ...r, afterYen: 5_000 }
          : r,
    );
    const check = checkRaise(raise(rows));
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual(["相談員手当が下がっています"]);
  });
  it("追加した手当に名前がなければエラー", () => {
    const rows: RaiseRow[] = [
      { key: "BASE", label: "基本給", unit: "MONTH", beforeYen: 200_000, afterYen: 200_000 },
      { key: "OTHER", label: "", unit: "MONTH", beforeYen: 0, afterYen: 3_000 },
    ];
    expect(checkRaise(raise(rows)).errors).toEqual(["追加した手当の名前を入力してください"]);
  });
  it("日付が不正ならエラー", () => {
    const rows = [{ ...rowsFromWage(hourly, qualificationDefaults)[0]!, afterYen: 1_150 }];
    expect(checkRaise(raise(rows, { kind: "HOURLY", effectiveOn: "2027-02-30" })).errors).toEqual([
      "新しい金額にする日を入力してください",
    ]);
  });
});

describe("applyRaiseToWage", () => {
  it("変更後の金額を次の労働条件通知書の賃金に写す (ひとり親手当などはそのまま)", () => {
    const rows = rowsFromWage(monthly, qualificationDefaults).map((r) =>
      r.key === "BASE"
        ? { ...r, afterYen: 210_000 }
        : r.key === "MANAGER"
          ? { ...r, afterYen: 20_000 }
          : r,
    );
    expect(applyRaiseToWage({ ...monthly, singleParentChildren: 1 }, "MONTHLY", rows)).toEqual({
      ...monthly,
      singleParentChildren: 1,
      baseYen: 210_000,
      managerAllowanceYen: 20_000,
    });
  });
  it("時給・夜勤専従も基本の金額を写す", () => {
    const hRows = [{ ...rowsFromWage(hourly, qualificationDefaults)[0]!, afterYen: 1_200 }];
    expect(applyRaiseToWage(hourly, "HOURLY", hRows)).toMatchObject({ hourlyYen: 1_200 });
    const night: NoticeWageInput = { kind: "NIGHT_DAILY", totalYen: 20_000, nightHours: 7 };
    const nRows = [{ ...rowsFromWage(night, qualificationDefaults)[0]!, afterYen: 21_000 }];
    expect(applyRaiseToWage(night, "NIGHT_DAILY", nRows)).toEqual({ ...night, totalYen: 21_000 });
  });
  it("賃金の形が違えば写さない", () => {
    const rows = [{ ...rowsFromWage(hourly, qualificationDefaults)[0]!, afterYen: 1_200 }];
    expect(applyRaiseToWage(monthly, "HOURLY", rows)).toBe(monthly);
  });
});

describe("前回の昇給から次の昇給へ", () => {
  it("変更後を変更前にし、0 円の追加手当は落とす", () => {
    const prev: RaiseRow[] = [
      { key: "BASE", label: "時給", unit: "HOUR", beforeYen: 1_100, afterYen: 1_150 },
      { key: "OTHER", label: "皆勤手当", unit: "MONTH", beforeYen: 0, afterYen: 3_000 },
      { key: "OTHER", label: "廃止", unit: "MONTH", beforeYen: 1_000, afterYen: 0 },
    ];
    expect(rowsFromPreviousRaise(prev)).toEqual([
      { key: "BASE", label: "時給", unit: "HOUR", beforeYen: 1_150, afterYen: 1_150 },
      { key: "OTHER", label: "皆勤手当", unit: "MONTH", beforeYen: 3_000, afterYen: 3_000 },
    ]);
  });
});

describe("書面", () => {
  const rows = rowsFromWage(monthly, qualificationDefaults).map((r) =>
    r.key === "BASE" ? { ...r, afterYen: 205_000 } : r,
  );
  it("0 円の行は載せず、月給は合計を出す", () => {
    expect(visibleRows(rows).map((r) => r.key)).toEqual(["BASE", "QUALIFICATION", "COUNSELOR"]);
    expect(monthlyTotals("MONTHLY", visibleRows(rows))).toEqual({
      beforeYen: 225_000,
      afterYen: 230_000,
    });
    expect(monthlyTotals("HOURLY", rows)).toBeNull();
  });
  it("HTML に氏名・開始日・増額・受領欄が出て、文字はエスケープされる", () => {
    const html = renderRaiseDocument({
      ...raise(rows, { message: "<いつも>ありがとう" }),
      employeeName: "架空 一郎",
      company: { name: "テスト介護株式会社", address: "", representative: "代表取締役　試験 太郎" },
      officeName: "テストホーム",
    });
    expect(html).toContain("架空 一郎　殿");
    expect(html).toContain("2027年4月1日から");
    expect(html).toContain("+5,000円");
    expect(html).toContain("受領書");
    expect(html).toContain("&lt;いつも&gt;ありがとう");
    expect(html).not.toContain("管理者手当");
  });
});

describe("parseRaiseInput", () => {
  const ok = raise(rowsFromWage(monthly, qualificationDefaults));
  it("正しい入力は JSON 往復で通る", () => {
    expect(parseRaiseInput(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });
  it("負の金額・未知の項目・引き継ぐ項目の重複は弾く", () => {
    const bad = (rows: unknown) => parseRaiseInput({ ...ok, rows });
    expect(bad([{ ...ok.rows[0], afterYen: -1 }])).toBeNull();
    expect(bad([{ ...ok.rows[0], key: "BONUS" }])).toBeNull();
    expect(bad([ok.rows[0], ok.rows[0]])).toBeNull();
    expect(parseRaiseInput({ ...ok, kind: "YEARLY" })).toBeNull();
  });
});
