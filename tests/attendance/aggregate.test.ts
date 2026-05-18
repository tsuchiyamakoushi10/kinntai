import { describe, expect, it } from "vitest";

import { formatMinutes, summarize } from "@/lib/attendance/aggregate";

const t = (iso: string): Date => new Date(iso);

describe("summarize", () => {
  it("出勤のみで退勤未済 → すべて 0", () => {
    expect(
      summarize({
        clockInAt: t("2026-05-18T00:15:00Z"),
        clockOutAt: null,
        breakRecords: [],
      }),
    ).toEqual({ spanMinutes: 0, breakMinutes: 0, workMinutes: 0 });
  });

  it("休憩なしの 8 時間勤務", () => {
    const s = summarize({
      // JST 09:00 出勤 → 17:00 退勤
      clockInAt: t("2026-05-18T00:00:00Z"),
      clockOutAt: t("2026-05-18T08:00:00Z"),
      breakRecords: [],
    });
    expect(s.spanMinutes).toBe(480);
    expect(s.breakMinutes).toBe(0);
    expect(s.workMinutes).toBe(480);
  });

  it("60 分休憩を 1 本挟むと実労働は 7 時間", () => {
    const s = summarize({
      clockInAt: t("2026-05-18T00:00:00Z"),
      clockOutAt: t("2026-05-18T08:00:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T03:00:00Z"), breakEndAt: t("2026-05-18T04:00:00Z") },
      ],
    });
    expect(s.breakMinutes).toBe(60);
    expect(s.workMinutes).toBe(420);
  });

  it("複数休憩は合算される", () => {
    const s = summarize({
      clockInAt: t("2026-05-18T00:00:00Z"),
      clockOutAt: t("2026-05-18T09:00:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T03:00:00Z"), breakEndAt: t("2026-05-18T03:30:00Z") },
        { breakStartAt: t("2026-05-18T06:00:00Z"), breakEndAt: t("2026-05-18T06:45:00Z") },
      ],
    });
    expect(s.breakMinutes).toBe(75);
    expect(s.workMinutes).toBe(540 - 75);
  });

  it("進行中の休憩 (breakEndAt = null) は除外される", () => {
    const s = summarize({
      clockInAt: t("2026-05-18T00:00:00Z"),
      clockOutAt: t("2026-05-18T08:00:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T03:00:00Z"), breakEndAt: t("2026-05-18T04:00:00Z") },
        { breakStartAt: t("2026-05-18T05:00:00Z"), breakEndAt: null },
      ],
    });
    expect(s.breakMinutes).toBe(60);
    expect(s.workMinutes).toBe(420);
  });

  it("夜勤跨ぎ: 16:30 出勤 → 翌 8:30 退勤、休憩 60 分", () => {
    const s = summarize({
      // JST 2026-05-18 16:30 = UTC 2026-05-18 07:30
      clockInAt: t("2026-05-18T07:30:00Z"),
      // JST 2026-05-19 08:30 = UTC 2026-05-18 23:30
      clockOutAt: t("2026-05-18T23:30:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T14:00:00Z"), breakEndAt: t("2026-05-18T15:00:00Z") },
      ],
    });
    expect(s.spanMinutes).toBe(16 * 60);
    expect(s.breakMinutes).toBe(60);
    expect(s.workMinutes).toBe(15 * 60);
  });

  it("退勤が出勤より前のような壊れたデータは負値にしない", () => {
    const s = summarize({
      clockInAt: t("2026-05-18T08:00:00Z"),
      clockOutAt: t("2026-05-18T07:00:00Z"),
      breakRecords: [],
    });
    expect(s.spanMinutes).toBe(0);
    expect(s.workMinutes).toBe(0);
  });

  it("秒は切り捨て (Math.floor)", () => {
    const s = summarize({
      // 59 秒の差は 0 分扱い
      clockInAt: t("2026-05-18T00:00:00Z"),
      clockOutAt: t("2026-05-18T00:00:59Z"),
      breakRecords: [],
    });
    expect(s.spanMinutes).toBe(0);
  });
});

describe("formatMinutes", () => {
  it("0 / マイナスは 0:00", () => {
    expect(formatMinutes(0)).toBe("0:00");
    expect(formatMinutes(-30)).toBe("0:00");
  });
  it("90 分は 1:30", () => {
    expect(formatMinutes(90)).toBe("1:30");
  });
  it("8 時間ちょうどは 8:00", () => {
    expect(formatMinutes(480)).toBe("8:00");
  });
  it("60 分単位を 0 詰めで表示", () => {
    expect(formatMinutes(61)).toBe("1:01");
  });
});
