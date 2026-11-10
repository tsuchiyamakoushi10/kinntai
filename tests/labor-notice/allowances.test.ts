/**
 * 人ごとに金額を入れる手当 (docs/labor-notice.md §2.2) のテスト。
 */
import { describe, expect, it } from "vitest";

import { computeNotice } from "@/lib/labor-notice/compute";
import { DEFAULT_ALLOWANCE_TYPES } from "@/lib/labor-notice/constants";
import {
  allowanceTypesFor,
  checkAllowanceTypes,
  setAllowanceYen,
} from "@/lib/labor-notice/masters";
import { parseNoticeInput } from "@/lib/labor-notice/parse";
import type { NoticeAllowanceType, NoticeMasters } from "@/lib/labor-notice/types";

import { fullTimeInput, masters, nightOnlyInput, partTimeInput } from "./fixtures";

const leader: NoticeAllowanceType = {
  code: "LEADER",
  label: "リーダー手当",
  targetTypes: ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"],
  includedInWageChecks: true,
  isActive: true,
};
const family: NoticeAllowanceType = {
  code: "FAMILY",
  label: "家族手当",
  targetTypes: ["FULL_TIME"],
  includedInWageChecks: false,
  isActive: true,
};

function withTypes(types: NoticeAllowanceType[], company = {}): NoticeMasters {
  return { ...masters(company), allowanceTypes: types };
}

const monthly = (baseYen: number) =>
  ({ kind: "MONTHLY", baseYen, qualification: "NONE", singleParentChildren: 0 }) as const;

describe("書面の賃金欄", () => {
  it("金額を入れた手当だけ、種類の並び順で、基本給・資格手当の後・決まった手当行の前に載る", () => {
    const { view, errors } = computeNotice(
      fullTimeInput({
        allowances: [
          { code: "COUNSELOR", yen: 15_000 },
          { code: "MANAGER", yen: 30_000 },
        ],
      }),
      masters(),
    );
    expect(errors).toEqual([]);
    const labels = view!.wage.rows.map((r) => r.label);
    expect(labels.slice(0, 4)).toEqual([
      "基本給",
      "資格手当（介護福祉士）",
      "管理者手当",
      "相談員手当",
    ]);
    expect(labels[4]).toBe("夜勤手当");
    expect(view!.wage.rows[2]!.body).toBe("月額 30,000円");
  });
  it("0 円の手当は載せない", () => {
    const { view } = computeNotice(
      fullTimeInput({ allowances: [{ code: "MANAGER", yen: 0 }] }),
      masters(),
    );
    expect(view!.wage.rows.map((r) => r.label)).not.toContain("管理者手当");
  });
  it("パート・夜勤専従にも載せられる (夜勤専従は日給の行の後)", () => {
    const m = withTypes([leader]);
    const part = computeNotice(partTimeInput({ allowances: [{ code: "LEADER", yen: 5_000 }] }), m);
    expect(part.view!.wage.rows.map((r) => r.label).slice(0, 2)).toEqual([
      "基本給",
      "リーダー手当",
    ]);
    const night = computeNotice(
      nightOnlyInput({ allowances: [{ code: "LEADER", yen: 5_000 }] }),
      m,
    );
    expect(night.view!.wage.rows.map((r) => r.label).slice(0, 2)).toEqual([
      "日給（1回あたり）",
      "リーダー手当",
    ]);
  });
  it("設定に無い手当が入っていたら発行できない", () => {
    const r = computeNotice(
      fullTimeInput({ allowances: [{ code: "UNKNOWN", yen: 1_000 }] }),
      masters(),
    );
    expect(r.errors.map((e) => e.field)).toContain("allowances");
  });
  it("使わない設定にした手当でも、金額が入っていれば載る (下書き・更新版を壊さない)", () => {
    const m = withTypes([{ ...leader, isActive: false }]);
    const { view, errors } = computeNotice(
      fullTimeInput({ allowances: [{ code: "LEADER", yen: 5_000 }] }),
      m,
    );
    expect(errors).toEqual([]);
    expect(view!.wage.rows.map((r) => r.label)).toContain("リーダー手当");
  });
});

describe("最低賃金・社会保険の判定", () => {
  // 埼玉県 1,196円 × 月160時間 = 191,360円
  it("月給: 「判定に含める」手当は最低賃金の分子に足す", () => {
    const m = withTypes([leader, family]);
    const low = computeNotice(fullTimeInput({ wage: monthly(190_000) }), m);
    expect(low.warnings.map((w) => w.code)).toContain("MIN_WAGE");
    const withLeader = computeNotice(
      fullTimeInput({ wage: monthly(190_000), allowances: [{ code: "LEADER", yen: 2_000 }] }),
      m,
    );
    expect(withLeader.warnings.map((w) => w.code)).not.toContain("MIN_WAGE");
  });
  it("月給: 「判定に含めない」手当 (家族手当など) は足さない", () => {
    const r = computeNotice(
      fullTimeInput({ wage: monthly(190_000), allowances: [{ code: "FAMILY", yen: 20_000 }] }),
      withTypes([leader, family]),
    );
    expect(r.warnings.map((w) => w.code)).toContain("MIN_WAGE");
  });
  it("時給: 最低賃金は時給で比べる (月額の手当は足さない)", () => {
    const r = computeNotice(
      partTimeInput({
        wage: { kind: "HOURLY", hourlyYen: 1195, qualification: "NONE", worksNight: false },
        allowances: [{ code: "LEADER", yen: 50_000 }],
      }),
      withTypes([leader]),
    );
    expect(r.warnings.map((w) => w.code)).toContain("MIN_WAGE");
  });
  it("時給: 社会保険の月額賃金 (8.8万円) には「判定に含める」手当を足す", () => {
    // 時給1,000円 × 週20時間 × 52 / 12 = 86,666円 → 8.8万円未満
    const input = partTimeInput({
      wage: { kind: "HOURLY", hourlyYen: 1000, qualification: "NONE", worksNight: false },
      daysPerWeek: 4,
      hoursPerWeek: 20,
    });
    const company = { employeeCount: 60 };
    const without = computeNotice(input, withTypes([leader], company));
    expect(without.view!.insurance.health).toBe("NOT_ENROLLED");
    const withLeader = computeNotice(
      { ...input, allowances: [{ code: "LEADER", yen: 2_000 }] },
      withTypes([leader], company),
    );
    expect(withLeader.view!.insurance.health).toBe("ENROLLED");
    const withFamily = computeNotice(
      {
        ...input,
        allowances: [
          { code: "LEADER", yen: 0 },
          { code: "FAMILY", yen: 2_000 },
        ],
      },
      withTypes([leader, family], company),
    );
    expect(withFamily.view!.insurance.health).toBe("NOT_ENROLLED");
  });
});

describe("入力の読み込み", () => {
  it("2026-11 より前の入力 (管理者手当・相談員手当) を人ごとの手当に読み替える", () => {
    const legacy = {
      ...fullTimeInput(),
      allowances: undefined,
      wage: { ...monthly(200_000), managerAllowanceYen: 30_000, counselorAllowanceYen: 0 },
    };
    const parsed = parseNoticeInput(JSON.parse(JSON.stringify(legacy)));
    expect(parsed?.allowances).toEqual([{ code: "MANAGER", yen: 30_000 }]);
    expect(parsed?.wage).toEqual({ ...monthly(200_000), qualificationAllowanceYen: null });
  });
  it("0 円は落とし、code の重複・小数・負の金額は弾く", () => {
    const parse = (allowances: unknown) => parseNoticeInput({ ...fullTimeInput(), allowances });
    expect(parse([{ code: "MANAGER", yen: 0 }])?.allowances).toEqual([]);
    expect(
      parse([
        { code: "MANAGER", yen: 1 },
        { code: "MANAGER", yen: 2 },
      ]),
    ).toBeNull();
    expect(parse([{ code: "MANAGER", yen: 1.5 }])).toBeNull();
    expect(parse([{ code: "MANAGER", yen: -1 }])).toBeNull();
    expect(parse([{ code: "", yen: 1 }])).toBeNull();
  });
});

describe("手当の種類の保存チェック", () => {
  it("既定値と新規行 (code 空) は通る。対象区分は決まった順に並べ直す", () => {
    const r = checkAllowanceTypes([
      ...DEFAULT_ALLOWANCE_TYPES,
      { ...leader, code: "", label: " 送迎手当 ", targetTypes: ["PART_TIME", "FULL_TIME"] },
    ]);
    expect(r.ok && r.value[2]).toEqual({
      ...leader,
      code: "",
      label: "送迎手当",
      targetTypes: ["FULL_TIME", "PART_TIME"],
    });
  });
  it("名前なし・重複・自動で載る名前・対象区分なし・不正な code は弾く", () => {
    const err = (rows: unknown[]) => {
      const r = checkAllowanceTypes(rows);
      return r.ok ? null : r.error;
    };
    expect(err([{ ...leader, label: " " }])).toContain("名前");
    expect(err([leader, { ...leader, code: "" }])).toContain("重複");
    expect(err([{ ...leader, label: "資格手当" }])).toContain("別の名前");
    expect(err([{ ...leader, targetTypes: [] }])).toContain("区分");
    expect(err([{ ...leader, code: "bad code" }])).not.toBeNull();
    expect(err([leader, { ...family, code: "LEADER" }])).not.toBeNull();
  });
});

describe("作成画面に出す手当", () => {
  it("その区分の使用中の種類 + 金額の入っている種類", () => {
    const types = [leader, family, { ...leader, code: "OLD", label: "旧手当", isActive: false }];
    expect(allowanceTypesFor(types, "PART_TIME", []).map((t) => t.code)).toEqual(["LEADER"]);
    expect(
      allowanceTypesFor(types, "PART_TIME", [{ code: "OLD", yen: 1_000 }]).map((t) => t.code),
    ).toEqual(["LEADER", "OLD"]);
  });
  it("setAllowanceYen: 0 円にすると行ごと消える", () => {
    const a = setAllowanceYen([], "LEADER", 5_000);
    expect(a).toEqual([{ code: "LEADER", yen: 5_000 }]);
    expect(setAllowanceYen(a, "LEADER", 0)).toEqual([]);
  });
});
