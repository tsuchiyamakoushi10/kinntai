import { describe, expect, it } from "vitest";

import {
  canEditAssessment,
  canEditSheet,
  changedItems,
  checkAssessmentSubmit,
  checkFinalConfirm,
  checkPeriod,
  defaultPrevCompensation,
  nextStep,
  parseRank,
  parseStep,
  parseYen,
  pickOption,
  pickOptions,
  type Ranks,
} from "./logic";

const all = (r: "S" | "A" | "B" | "C" | null): Ranks => ({
  userCenteredAction: r,
  respectfulInteraction: r,
  teamwork: r,
  initiativeImprovement: r,
  responsibility: r,
});

describe("parse", () => {
  it("ランク・STEP は決まった値だけ通す", () => {
    expect(parseRank("A")).toBe("A");
    expect(parseRank("a")).toBeNull();
    expect(parseRank("")).toBeNull();
    expect(parseStep("STEP3")).toBe("STEP3");
    expect(parseStep("STEP6")).toBeNull();
  });

  it("選択肢は選択肢の順・重複なし・選択肢外は落とす", () => {
    expect(pickOptions(["c", "a", "x", "a"], ["a", "b", "c"])).toEqual(["a", "c"]);
    expect(pickOption("b", ["a", "b"])).toBe("b");
    expect(pickOption("z", ["a", "b"])).toBeNull();
  });

  it("金額は カンマ・円・全角 を許す。空は null、読めないと undefined", () => {
    expect(parseYen("250,000")).toBe(250000);
    expect(parseYen("２５００００円")).toBe(250000);
    expect(parseYen("")).toBeNull();
    expect(parseYen("  ")).toBeNull();
    expect(parseYen("-1")).toBeUndefined();
    expect(parseYen("abc")).toBeUndefined();
  });
});

describe("直せるかどうか", () => {
  it("面談シートは面談記録が完了するまで本人が直せる", () => {
    expect(canEditSheet(null)).toBe(true);
    expect(canEditSheet("IN_PROGRESS")).toBe(true);
    expect(canEditSheet("DONE")).toBe(false);
  });

  it("一次考課は最終考課が確定するまで直せる", () => {
    expect(canEditAssessment(null)).toBe(true);
    expect(canEditAssessment("DRAFT")).toBe(true);
    expect(canEditAssessment("CONFIRMED")).toBe(false);
  });
});

describe("考課のチェック", () => {
  it("一次考課の提出は 5 項目すべて必要", () => {
    expect(checkAssessmentSubmit(all("A"))).toEqual([]);
    const errs = checkAssessmentSubmit({ ...all("A"), teamwork: null });
    expect(errs[0]).toContain("チームワーク");
  });

  it("変えた項目だけを拾う (未入力は比べない)", () => {
    expect(changedItems(null, all("A"))).toEqual([]);
    expect(changedItems(all("A"), { ...all("A"), teamwork: "S" })).toEqual(["teamwork"]);
    expect(changedItems({ ...all("A"), teamwork: null }, { ...all("A"), teamwork: "S" })).toEqual(
      [],
    );
  });

  it("最終考課: 変えたら理由が要る・総合評価が要る", () => {
    expect(checkFinalConfirm(all("A"), all("A"), "A", "")).toEqual([]);
    expect(checkFinalConfirm(all("A"), { ...all("A"), teamwork: "S" }, "A", "")).toHaveLength(1);
    expect(checkFinalConfirm(all("A"), { ...all("A"), teamwork: "S" }, "A", "理由")).toEqual([]);
    expect(checkFinalConfirm(null, all("B"), null, "")).toEqual(["総合評価を選んでください"]);
    expect(checkFinalConfirm(null, all(null), "A", "")[0]).toContain("利用者本位の行動");
  });
});

describe("処遇の前期の初期値", () => {
  it("前の期間の今期の値を使う", () => {
    expect(
      defaultPrevCompensation(
        { currentBaseSalary: 230000, currentBonus: 100000 },
        { baseWageType: "MONTHLY", baseWageAmount: 220000 },
      ),
    ).toEqual({ prevBaseSalary: 230000, prevBonus: 100000 });
  });

  it("前の記録が無ければ月給の人は従業員マスタの金額", () => {
    expect(
      defaultPrevCompensation(null, { baseWageType: "MONTHLY", baseWageAmount: 220000 }),
    ).toEqual({ prevBaseSalary: 220000, prevBonus: null });
    expect(
      defaultPrevCompensation(
        { currentBaseSalary: null, currentBonus: null },
        { baseWageType: "MONTHLY", baseWageAmount: 220000 },
      ),
    ).toEqual({ prevBaseSalary: 220000, prevBonus: null });
  });

  it("時給の人は基本給を入れない", () => {
    expect(defaultPrevCompensation(null, { baseWageType: "HOURLY", baseWageAmount: 1100 })).toEqual(
      { prevBaseSalary: null, prevBonus: null },
    );
  });
});

describe("評価期間のチェック", () => {
  it("名前・日付・前後関係", () => {
    expect(
      checkPeriod({ name: "2026年 上期", startOn: "2026-04-01", endOn: "2026-09-30" }),
    ).toEqual([]);
    expect(checkPeriod({ name: " ", startOn: "2026-04-01", endOn: "2026-09-30" })).toHaveLength(1);
    expect(checkPeriod({ name: "x", startOn: "", endOn: "2026-09-30" })).toHaveLength(1);
    expect(checkPeriod({ name: "x", startOn: "2026-10-01", endOn: "2026-09-30" })).toHaveLength(1);
  });
});

describe("次にやること", () => {
  const base = {
    sheetSubmitted: true,
    recordStatus: "DONE",
    assessmentStatus: "SUBMITTED",
    finalStatus: "CONFIRMED",
    reviewStatus: "CONFIRMED",
  } as const;
  it("流れの順に最初の未完了を返す", () => {
    expect(nextStep(base)).toBe("done");
    expect(nextStep({ ...base, sheetSubmitted: false })).toBe("sheet");
    expect(nextStep({ ...base, recordStatus: "IN_PROGRESS" })).toBe("record");
    expect(nextStep({ ...base, assessmentStatus: "DRAFT" })).toBe("assessment");
    expect(nextStep({ ...base, finalStatus: null })).toBe("final");
    expect(nextStep({ ...base, reviewStatus: "DRAFT" })).toBe("review");
  });
});
