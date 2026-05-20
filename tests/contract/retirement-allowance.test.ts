import { describe, expect, it } from "vitest";

import {
  judgeRetirementAllowance,
  RETIREMENT_ALLOWANCE_THRESHOLD_DAYS_FOR_TEST,
} from "@/lib/contract/retirement-allowance";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("judgeRetirementAllowance", () => {
  it("契約がゼロなら通算 0 日 / 対象外", () => {
    const result = judgeRetirementAllowance([], d("2026-05-20"));
    expect(result.fullTimeTotalDays).toBe(0);
    expect(result.autoEligible).toBe(false);
    expect(result.finalEligible).toBe(false);
    expect(result.daysUntilEligible).toBe(RETIREMENT_ALLOWANCE_THRESHOLD_DAYS_FOR_TEST);
  });

  it("正社員契約が継続中で 2 年経過: 対象外 (まだ 365 日残り)", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2024-05-20"),
          contractEndOn: null,
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    // 2024-05-20 から 2026-05-20 まで (inclusive) = 731 日 (うるう年含む)
    expect(result.fullTimeTotalDays).toBe(731);
    expect(result.autoEligible).toBe(false);
    expect(result.daysUntilEligible).toBe(1095 - 731);
  });

  it("正社員契約が 3 年経過ちょうど (1095 日): 対象", () => {
    // 1094 日進めると inclusive 1095 日
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2023-05-22"),
          contractEndOn: null,
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    expect(result.fullTimeTotalDays).toBe(1095);
    expect(result.autoEligible).toBe(true);
    expect(result.finalEligible).toBe(true);
    expect(result.daysUntilEligible).toBe(0);
  });

  it("contract / part_time だけだと正社員通算 0 日のまま", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "CONTRACT",
          contractStartOn: d("2020-01-01"),
          contractEndOn: d("2025-12-31"),
          retirementAllowanceEligible: null,
        },
        {
          employmentType: "PART_TIME",
          contractStartOn: d("2018-01-01"),
          contractEndOn: null,
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    expect(result.fullTimeTotalDays).toBe(0);
    expect(result.autoEligible).toBe(false);
  });

  it("正社員 → パート → 正社員の通算: 正社員期間だけ合算", () => {
    // 正社員 2 年 (2020-01-01 〜 2021-12-31) + パート 1 年 + 正社員 2 年 (2023-01-01 〜 2024-12-31)
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2020-01-01"),
          contractEndOn: d("2021-12-31"),
          retirementAllowanceEligible: null,
        },
        {
          employmentType: "PART_TIME",
          contractStartOn: d("2022-01-01"),
          contractEndOn: d("2022-12-31"),
          retirementAllowanceEligible: null,
        },
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2023-01-01"),
          contractEndOn: d("2024-12-31"),
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    // 2020-01-01 〜 2021-12-31: 731 日 (うるう年 2020 含む)
    // 2023-01-01 〜 2024-12-31: 731 日 (うるう年 2024 含む)
    expect(result.fullTimeTotalDays).toBe(731 + 731);
    expect(result.autoEligible).toBe(true);
  });

  it("正社員契約が連続して被っていても二重カウントしない", () => {
    // 同じ期間を契約更新で重複させたケース
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2023-01-01"),
          contractEndOn: d("2024-12-31"),
          retirementAllowanceEligible: null,
        },
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2024-06-01"),
          contractEndOn: d("2025-12-31"),
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    // 2023-01-01 〜 2025-12-31 の和集合 = 1096 日
    expect(result.fullTimeTotalDays).toBe(1096);
    expect(result.autoEligible).toBe(true);
  });

  it("最新契約で manualOverride=false なら finalEligible は false (自動判定が true でも上書き)", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2023-01-01"),
          contractEndOn: null,
          retirementAllowanceEligible: false,
        },
      ],
      d("2026-05-20"),
    );
    expect(result.autoEligible).toBe(true);
    expect(result.manualOverride).toBe(false);
    expect(result.finalEligible).toBe(false);
  });

  it("最新契約で manualOverride=true なら通算未到達でも finalEligible は true", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2025-05-20"),
          contractEndOn: null,
          retirementAllowanceEligible: true,
        },
      ],
      d("2026-05-20"),
    );
    expect(result.autoEligible).toBe(false);
    expect(result.manualOverride).toBe(true);
    expect(result.finalEligible).toBe(true);
  });

  it("manualOverride は最新契約 (contract_start_on が最大) の値を採用", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2020-01-01"),
          contractEndOn: d("2022-12-31"),
          retirementAllowanceEligible: true, // 古い契約の手動値
        },
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2023-01-01"),
          contractEndOn: null,
          retirementAllowanceEligible: null, // 最新契約: 自動判定
        },
      ],
      d("2026-05-20"),
    );
    expect(result.manualOverride).toBeNull();
    expect(result.finalEligible).toBe(result.autoEligible);
  });

  it("contract_end_on が start より過去なら無効区間として扱う (0 日)", () => {
    const result = judgeRetirementAllowance(
      [
        {
          employmentType: "FULL_TIME",
          contractStartOn: d("2025-06-01"),
          contractEndOn: d("2025-05-31"), // データ不整合
          retirementAllowanceEligible: null,
        },
      ],
      d("2026-05-20"),
    );
    expect(result.fullTimeTotalDays).toBe(0);
  });
});
