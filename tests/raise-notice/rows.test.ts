import { describe, expect, it } from "vitest";

import { DEFAULT_ALLOWANCE_TYPES, EMPLOYMENT_PRESETS } from "@/lib/labor-notice/constants";
import type { NoticeAllowanceType, NoticeInput, NoticeWageInput } from "@/lib/labor-notice/types";
import { renderRaiseDocument } from "@/lib/raise-notice/html";
import {
  applyRaiseToNotice,
  applyRaiseToWage,
  checkRaise,
  monthlyTotals,
  parseRaiseInput,
  rowsFromNotice,
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
};

const monthlyNotice: Pick<NoticeInput, "employmentType" | "wage" | "allowances"> = {
  employmentType: "FULL_TIME",
  wage: monthly,
  allowances: [{ code: "COUNSELOR", yen: 10_000 }],
};
const types = DEFAULT_ALLOWANCE_TYPES;
const monthlyRows = () => rowsFromNotice(monthlyNotice, qualificationDefaults, types);

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

describe("rowsFromNotice / rowsFromWage", () => {
  it("月給: 基本給・資格手当と、正社員に載せる人ごとの手当 (0 円も) の行を今の金額で作る", () => {
    const rows = monthlyRows();
    expect(rows.map((r) => [r.key, r.code, r.label, r.beforeYen, r.afterYen])).toEqual([
      ["BASE", undefined, "基本給", 200_000, 200_000],
      ["QUALIFICATION", undefined, "資格手当（介護福祉士）", 15_000, 15_000],
      ["ALLOWANCE", "MANAGER", "管理者手当", 0, 0],
      ["ALLOWANCE", "COUNSELOR", "相談員手当", 10_000, 10_000],
    ]);
  });
  it("使わない設定の手当でも、金額が入っていれば行に出す。区分外で 0 円なら出さない", () => {
    const custom: NoticeAllowanceType[] = [
      { ...types[0]!, isActive: false },
      { ...types[1]!, isActive: false },
      {
        code: "LEADER",
        label: "リーダー手当",
        targetTypes: ["PART_TIME"],
        includedInWageChecks: true,
        isActive: true,
      },
    ];
    const rows = rowsFromNotice(monthlyNotice, qualificationDefaults, custom);
    expect(rows.filter((r) => r.key === "ALLOWANCE").map((r) => r.code)).toEqual(["COUNSELOR"]);
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
    const rows = monthlyRows();
    expect(checkRaise(raise(rows)).errors).toContain(
      "金額が変わっていません。変更後の金額を入力してください",
    );
  });
  it("基本給を上げれば問題なし。下がった行は警告", () => {
    const rows = monthlyRows().map((r) =>
      r.key === "BASE"
        ? { ...r, afterYen: 205_000 }
        : r.code === "COUNSELOR"
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

describe("applyRaiseToNotice / applyRaiseToWage", () => {
  it("変更後の金額を次の労働条件通知書の賃金と人ごとの手当に写す (ひとり親手当などはそのまま)", () => {
    const rows = monthlyRows().map((r) =>
      r.key === "BASE"
        ? { ...r, afterYen: 210_000 }
        : r.code === "MANAGER"
          ? { ...r, afterYen: 20_000 }
          : r.code === "COUNSELOR"
            ? { ...r, afterYen: 0 }
            : r,
    );
    const next = applyRaiseToNotice(
      { ...monthlyNotice, wage: { ...monthly, singleParentChildren: 1 } },
      "MONTHLY",
      rows,
    );
    expect(next.wage).toEqual({ ...monthly, singleParentChildren: 1, baseYen: 210_000 });
    expect(next.allowances).toEqual([{ code: "MANAGER", yen: 20_000 }]);
  });
  it("2026-11 より前の昇給通知 (key: MANAGER / COUNSELOR) も手当に写す", () => {
    const legacy = [
      { key: "BASE", label: "基本給", unit: "MONTH", beforeYen: 200_000, afterYen: 200_000 },
      { key: "MANAGER", label: "管理者手当", unit: "MONTH", beforeYen: 0, afterYen: 30_000 },
    ] as unknown as RaiseRow[];
    expect(applyRaiseToNotice(monthlyNotice, "MONTHLY", legacy).allowances).toEqual([
      { code: "COUNSELOR", yen: 10_000 },
      { code: "MANAGER", yen: 30_000 },
    ]);
  });
  it("賃金の形が違えば手当も写さない", () => {
    const rows = [
      {
        key: "ALLOWANCE",
        code: "MANAGER",
        label: "管理者手当",
        unit: "MONTH",
        beforeYen: 0,
        afterYen: 1,
      },
    ] as RaiseRow[];
    expect(applyRaiseToNotice(monthlyNotice, "HOURLY", rows)).toBe(monthlyNotice);
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
    expect(rowsFromPreviousRaise(prev, "HOURLY", types)).toEqual([
      { key: "BASE", label: "時給", unit: "HOUR", beforeYen: 1_150, afterYen: 1_150 },
      { key: "OTHER", label: "皆勤手当", unit: "MONTH", beforeYen: 3_000, afterYen: 3_000 },
    ]);
  });
  it("旧 key (MANAGER / COUNSELOR) を読み替え、後から設定で足した手当は 0 円で追加手当より前に足す", () => {
    const prev = [
      { key: "BASE", label: "基本給", unit: "MONTH", beforeYen: 200_000, afterYen: 205_000 },
      { key: "COUNSELOR", label: "相談員手当", unit: "MONTH", beforeYen: 10_000, afterYen: 12_000 },
      { key: "OTHER", label: "皆勤手当", unit: "MONTH", beforeYen: 0, afterYen: 3_000 },
    ] as unknown as RaiseRow[];
    const rows = rowsFromPreviousRaise(prev, "MONTHLY", types);
    expect(rows.map((r) => [r.key, r.code, r.beforeYen])).toEqual([
      ["BASE", undefined, 205_000],
      ["ALLOWANCE", "COUNSELOR", 12_000],
      ["ALLOWANCE", "MANAGER", 0],
      ["OTHER", undefined, 3_000],
    ]);
  });
});

describe("書面", () => {
  const rows = monthlyRows().map((r) => (r.key === "BASE" ? { ...r, afterYen: 205_000 } : r));
  it("0 円の行は載せず、月給は合計を出す", () => {
    expect(visibleRows(rows).map((r) => r.label)).toEqual([
      "基本給",
      "資格手当（介護福祉士）",
      "相談員手当",
    ]);
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
  const ok = raise(monthlyRows());
  it("正しい入力は JSON 往復で通る", () => {
    expect(parseRaiseInput(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });
  it("負の金額・未知の項目・引き継ぐ項目の重複は弾く", () => {
    const bad = (rows: unknown) => parseRaiseInput({ ...ok, rows });
    expect(bad([{ ...ok.rows[0], afterYen: -1 }])).toBeNull();
    expect(bad([{ ...ok.rows[0], key: "BONUS" }])).toBeNull();
    expect(bad([ok.rows[0], ok.rows[0]])).toBeNull();
    // 人ごとの手当は code が必要で、同じ code の重複は弾く (違う code なら並べてよい)
    const allowance = ok.rows.find((r) => r.code === "COUNSELOR")!;
    expect(bad([ok.rows[0], { ...allowance, code: undefined }])).toBeNull();
    expect(bad([ok.rows[0], allowance, allowance])).toBeNull();
    expect(bad([ok.rows[0], allowance, { ...allowance, code: "MANAGER" }])).not.toBeNull();
    expect(parseRaiseInput({ ...ok, kind: "YEARLY" })).toBeNull();
  });
});
