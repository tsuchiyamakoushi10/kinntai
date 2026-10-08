import { describe, expect, it } from "vitest";

import { computeNotice } from "@/lib/labor-notice/compute";
import { EMPLOYMENT_PRESETS } from "@/lib/labor-notice/constants";
import {
  checkMinWage,
  checkPreset,
  checkWorkPatterns,
  mergePreset,
} from "@/lib/labor-notice/masters";

import { fullTimeInput, masters, partTimeInput } from "./fixtures";

const codes = ["EARLY", "DAY", "LATE", "NIGHT", "SHORT_NIGHT", "SHORT_DAY", "HALF_DAY"];

describe("区分ごとの初期値の保存チェック", () => {
  it("既定値はそのまま通る", () => {
    expect(checkPreset(EMPLOYMENT_PRESETS.FULL_TIME, codes)).toEqual({
      ok: true,
      value: EMPLOYMENT_PRESETS.FULL_TIME,
    });
  });
  it("試用期間・休日出勤は空欄にでき、書面から消える (null)", () => {
    const r = checkPreset(
      {
        ...EMPLOYMENT_PRESETS.FULL_TIME,
        texts: { ...EMPLOYMENT_PRESETS.FULL_TIME.texts, trialPeriod: " ", holidayWork: "" },
      },
      codes,
    );
    expect(r.ok && r.value.texts.trialPeriod).toBeNull();
    expect(r.ok && r.value.texts.holidayWork).toBeNull();
  });
  it("休日などの必須の文言を空にするとエラー", () => {
    const r = checkPreset(
      {
        ...EMPLOYMENT_PRESETS.FULL_TIME,
        texts: { ...EMPLOYMENT_PRESETS.FULL_TIME.texts, holidays: "" },
      },
      codes,
    );
    expect(r).toEqual({ ok: false, error: "休日を入力してください" });
  });
  it("手当の空行は捨て、片方だけの行はエラー", () => {
    const base = EMPLOYMENT_PRESETS.NIGHT_ONLY;
    const ok = checkPreset(
      { ...base, allowanceRows: [...base.allowanceRows, { label: "", body: "" }] },
      codes,
    );
    expect(ok.ok && ok.value.allowanceRows).toHaveLength(1);
    const ng = checkPreset({ ...base, allowanceRows: [{ label: "皆勤手当", body: "" }] }, codes);
    expect(ng.ok).toBe(false);
  });
  it("知らない勤務パターンや範囲外の月数は弾く", () => {
    expect(
      checkPreset({ ...EMPLOYMENT_PRESETS.PART_TIME, defaultPatternCodes: ["NOPE"] }, codes).ok,
    ).toBe(false);
    expect(
      checkPreset({ ...EMPLOYMENT_PRESETS.PART_TIME, defaultFixedTermMonths: 0 }, codes).ok,
    ).toBe(false);
  });
  it("期間の定めなしにしたら「無期へ切替」は外す", () => {
    const r = checkPreset({ ...EMPLOYMENT_PRESETS.PART_TIME, defaultFixedTermMonths: null }, codes);
    expect(r.ok && r.value.convertsToIndefinite).toBe(false);
  });
});

describe("DB の値と既定値の合成", () => {
  it("行が無ければ既定値", () => {
    expect(mergePreset(EMPLOYMENT_PRESETS.PART_TIME, null)).toBe(EMPLOYMENT_PRESETS.PART_TIME);
  });
  it("壊れた JSON は既定値に戻し、帳票を止めない", () => {
    const merged = mergePreset(EMPLOYMENT_PRESETS.PART_TIME, {
      texts: "broken",
      defaultFixedTermMonths: 3,
      convertsToIndefinite: false,
      defaultPatternCodes: ["DAY"],
      allowanceRows: [{ nope: 1 }],
      qualificationAllowances: null,
    });
    expect(merged.texts).toEqual(EMPLOYMENT_PRESETS.PART_TIME.texts);
    expect(merged.allowanceRows).toEqual(EMPLOYMENT_PRESETS.PART_TIME.allowanceRows);
    expect(merged.defaultFixedTermMonths).toBe(3);
  });
});

describe("マスターの変更が通知書に反映される", () => {
  it("社長が変えた休日・手当・資格手当が書面と計算に出る", () => {
    const m = masters();
    const custom = {
      ...m,
      presets: {
        ...m.presets,
        FULL_TIME: {
          ...m.presets.FULL_TIME,
          texts: { ...m.presets.FULL_TIME.texts, holidays: "月10日（シフト表で指定）" },
          allowanceRows: [{ label: "皆勤手当", body: "月額 5,000円" }],
          qualificationAllowances: {
            ...m.presets.FULL_TIME.qualificationAllowances,
            NURSE: 30_000,
          },
        },
      },
    };
    const { view, errors } = computeNotice(
      fullTimeInput({
        wage: {
          kind: "MONTHLY",
          baseYen: 250_000,
          qualification: "NURSE",
          singleParentChildren: 0,
          managerAllowanceYen: 0,
          counselorAllowanceYen: 0,
        },
      }),
      custom,
    );
    expect(errors).toEqual([]);
    expect(view?.holidays).toBe("月10日（シフト表で指定）");
    expect(view?.wage.rows.map((r) => r.label)).toEqual([
      "基本給",
      "資格手当（正看護師）",
      "皆勤手当",
    ]);
    expect(view?.wage.rows[1]?.body).toBe("月額 30,000円");
  });
  it("最低賃金の行を足すと、その発効日以降の契約で使われる", () => {
    const m = {
      ...masters(),
      minWages: [
        ...masters().minWages,
        { prefecture: "埼玉県", yen: 1250, effectiveFrom: "2027-10-01" },
      ],
    };
    const wage = {
      kind: "HOURLY" as const,
      hourlyYen: 1200,
      qualification: "NONE" as const,
      worksNight: false,
    };
    expect(computeNotice(partTimeInput({ wage }), m).warnings.map((w) => w.code)).not.toContain(
      "MIN_WAGE",
    );
    expect(
      computeNotice(partTimeInput({ wage, contractStartOn: "2027-10-01" }), m).warnings.map(
        (w) => w.code,
      ),
    ).toContain("MIN_WAGE");
  });
});

describe("勤務パターン・最低賃金の保存チェック", () => {
  const p = {
    code: "",
    label: "日勤",
    start: "08:15",
    end: "17:15",
    endsNextDay: false,
    breakMinutes: 60,
  };
  it("正しい行は通る", () => {
    expect(checkWorkPatterns([p]).ok).toBe(true);
  });
  it("日をまたぐのに「翌日」が付いていないとエラー", () => {
    const r = checkWorkPatterns([{ ...p, label: "夜勤", start: "16:30", end: "08:30" }]);
    expect(r.ok).toBe(false);
    expect(
      checkWorkPatterns([{ ...p, label: "夜勤", start: "16:30", end: "08:30", endsNextDay: true }])
        .ok,
    ).toBe(true);
  });
  it("名前の重複・全部「使わない」はエラー", () => {
    expect(checkWorkPatterns([p, p]).ok).toBe(false);
    expect(checkWorkPatterns([{ ...p, isActive: false }]).ok).toBe(false);
  });
  it("最低賃金は金額と発効日が必要", () => {
    expect(checkMinWage({ prefecture: "埼玉県", yen: 1250, effectiveFrom: "2027-10-01" }).ok).toBe(
      true,
    );
    expect(
      checkMinWage({ prefecture: "埼玉県", yen: Number.NaN, effectiveFrom: "2027-10-01" }).ok,
    ).toBe(false);
    expect(checkMinWage({ prefecture: "埼玉県", yen: 1250, effectiveFrom: "" }).ok).toBe(false);
  });
});
