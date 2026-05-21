import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANNUAL_INCOME_CAP_YEN,
  EXCEEDED_RATIO,
  WARN_RATIO,
  patternWorkMinutes,
  projectAnnualIncome,
  type ShiftAssignment,
} from "@/lib/shift/income-projection";

describe("patternWorkMinutes", () => {
  it("8:15-17:15 / 休憩 60 分 → 480 分", () => {
    expect(
      patternWorkMinutes({
        startTime: "08:15",
        endTime: "17:15",
        crossesMidnight: false,
        breakMinutes: 60,
      }),
    ).toBe(480);
  });

  it("夜勤前半 16:30-00:00 (跨ぎ) / 休憩 0 → 450 分", () => {
    expect(
      patternWorkMinutes({
        startTime: "16:30",
        endTime: "00:00",
        crossesMidnight: true,
        breakMinutes: 0,
      }),
    ).toBe(450);
  });

  it("跨ぎ 22:00-翌7:00 / 休憩 60 → 480 分", () => {
    expect(
      patternWorkMinutes({
        startTime: "22:00",
        endTime: "07:00",
        crossesMidnight: true,
        breakMinutes: 60,
      }),
    ).toBe(480);
  });

  it("startTime / endTime いずれか null は 0 (公休 / 有休)", () => {
    expect(
      patternWorkMinutes({
        startTime: null,
        endTime: null,
        crossesMidnight: false,
        breakMinutes: 0,
      }),
    ).toBe(0);
  });

  it("不正な時刻表記は 0 を返す", () => {
    expect(
      patternWorkMinutes({
        startTime: "ab:cd",
        endTime: "10:00",
        crossesMidnight: false,
        breakMinutes: 0,
      }),
    ).toBe(0);
  });

  it("休憩 > 拘束 でも 0 で抑える", () => {
    expect(
      patternWorkMinutes({
        startTime: "10:00",
        endTime: "11:00",
        crossesMidnight: false,
        breakMinutes: 120,
      }),
    ).toBe(0);
  });
});

const dayPattern = {
  startTime: "08:15",
  endTime: "17:15",
  crossesMidnight: false,
  breakMinutes: 60,
} as const;

function dayShifts(year: number, count: number): ShiftAssignment[] {
  const out: ShiftAssignment[] = [];
  for (let i = 0; i < count; i++) {
    // 月跨ぎを避けるため 31 日ごとに月をずらす
    const month = Math.min(12, Math.floor(i / 28) + 1);
    const day = (i % 28) + 1;
    const mm = month.toString().padStart(2, "0");
    const dd = day.toString().padStart(2, "0");
    out.push({ workDate: `${year}-${mm}-${dd}`, pattern: dayPattern });
  }
  return out;
}

describe("projectAnnualIncome", () => {
  it("時給契約なしの場合は金額計算をスキップする", () => {
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: null,
      capYen: null,
      shifts: dayShifts(2026, 200),
    });
    expect(r.totalWorkMinutes).toBe(200 * 480);
    expect(r.projectedIncomeYen).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.severity).toBe("ok");
  });

  it("時給 1200 円 × 80 日 (480 分) は 1200 × 8 × 80 = 768000 円", () => {
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 1200,
      capYen: null,
      shifts: dayShifts(2026, 80),
    });
    expect(r.projectedIncomeYen).toBe(1200 * 8 * 80);
    expect(r.effectiveCapYen).toBe(DEFAULT_ANNUAL_INCOME_CAP_YEN);
    expect(r.severity).toBe("ok");
  });

  it("130 万円の 80% (104 万円) を超えると warn", () => {
    // 1200 円 × 8h × 110 日 = 1,056,000 円 > 1,040,000 円
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 1200,
      capYen: null,
      shifts: dayShifts(2026, 110),
    });
    expect(r.projectedIncomeYen).toBe(1056000);
    expect(r.ratio).toBeGreaterThanOrEqual(WARN_RATIO);
    expect(r.ratio).toBeLessThan(EXCEEDED_RATIO);
    expect(r.severity).toBe("warn");
  });

  it("130 万円を超えると exceeded", () => {
    // 1200 × 8 × 140 = 1,344,000 > 1,300,000
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 1200,
      capYen: null,
      shifts: dayShifts(2026, 140),
    });
    expect(r.severity).toBe("exceeded");
  });

  it("capYen を明示すると DEFAULT より優先される", () => {
    // capYen = 800000 / 1200×8×60=576000 → 0.72 (ok)
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 1200,
      capYen: 800_000,
      shifts: dayShifts(2026, 60),
    });
    expect(r.effectiveCapYen).toBe(800_000);
    expect(r.severity).toBe("ok");
  });

  it("対象年外のシフトは無視する", () => {
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 1200,
      capYen: null,
      shifts: [
        ...dayShifts(2025, 200), // 無視
        ...dayShifts(2026, 10),
      ],
    });
    expect(r.totalWorkMinutes).toBe(10 * 480);
  });

  it("時給 0 または負は月給扱いとして金額計算をスキップ", () => {
    const r = projectAnnualIncome({
      year: 2026,
      hourlyWageYen: 0,
      capYen: null,
      shifts: dayShifts(2026, 10),
    });
    expect(r.projectedIncomeYen).toBeNull();
    expect(r.severity).toBe("ok");
  });
});
