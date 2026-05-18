import { describe, expect, it } from "vitest";

import {
  formatMinutes,
  nightMinutes,
  nightOverlapMinutes,
  overtimeMinutes,
  summarize,
} from "@/lib/attendance/aggregate";

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

describe("overtimeMinutes", () => {
  it("所定 8h に対して 8h 勤務は残業 0", () => {
    expect(overtimeMinutes(480, 8)).toBe(0);
  });
  it("所定 8h に対して 9h 勤務は残業 60 分", () => {
    expect(overtimeMinutes(540, 8)).toBe(60);
  });
  it("所定未満 (パートの早退など) はマイナスにせず 0", () => {
    expect(overtimeMinutes(300, 8)).toBe(0);
  });
  it("Decimal な所定 7.5h でも近似は四捨五入で扱う", () => {
    expect(overtimeMinutes(480, 7.5)).toBe(480 - 450);
  });
  it("実労働 0 や所定 0 は 0 を返す", () => {
    expect(overtimeMinutes(0, 8)).toBe(0);
    expect(overtimeMinutes(480, 0)).toBe(0);
  });
});

describe("nightOverlapMinutes", () => {
  const t = (iso: string): Date => new Date(iso);

  it("深夜帯にまったく入らない区間は 0", () => {
    // JST 9:00 - 17:00
    expect(nightOverlapMinutes(t("2026-05-18T00:00:00Z"), t("2026-05-18T08:00:00Z"))).toBe(0);
  });

  it("22:00 ぴったりから始まれば 22:00 - 翌 5:00 で 7 時間", () => {
    // JST 2026-05-18 22:00 = UTC 13:00、翌 5:00 = UTC 20:00
    expect(nightOverlapMinutes(t("2026-05-18T13:00:00Z"), t("2026-05-18T20:00:00Z"))).toBe(7 * 60);
  });

  it("夜勤跨ぎ 16:30 - 翌 8:30 は深夜帯と 7 時間重なる", () => {
    // JST 2026-05-18 16:30 = UTC 07:30、翌 8:30 = UTC 23:30 (翌)
    expect(nightOverlapMinutes(t("2026-05-18T07:30:00Z"), t("2026-05-18T23:30:00Z"))).toBe(7 * 60);
  });

  it("夕方 21:00 - 23:00 は 22:00 以降の 1 時間だけ深夜", () => {
    // JST 21:00 = UTC 12:00、JST 23:00 = UTC 14:00
    expect(nightOverlapMinutes(t("2026-05-18T12:00:00Z"), t("2026-05-18T14:00:00Z"))).toBe(60);
  });

  it("早朝 4:00 - 7:00 は 5:00 までの 1 時間だけ深夜", () => {
    // JST 04:00 = UTC 前日 19:00、JST 07:00 = UTC 前日 22:00 ... 違う
    // JST 2026-05-19 04:00 = UTC 2026-05-18 19:00
    // JST 2026-05-19 07:00 = UTC 2026-05-18 22:00
    expect(nightOverlapMinutes(t("2026-05-18T19:00:00Z"), t("2026-05-18T22:00:00Z"))).toBe(60);
  });

  it("from >= to は 0", () => {
    expect(nightOverlapMinutes(t("2026-05-18T13:00:00Z"), t("2026-05-18T13:00:00Z"))).toBe(0);
    expect(nightOverlapMinutes(t("2026-05-18T14:00:00Z"), t("2026-05-18T13:00:00Z"))).toBe(0);
  });
});

describe("nightMinutes", () => {
  const t = (iso: string): Date => new Date(iso);

  it("退勤未済は 0", () => {
    expect(
      nightMinutes({
        clockInAt: t("2026-05-18T13:00:00Z"),
        clockOutAt: null,
        breakRecords: [],
      }),
    ).toBe(0);
  });

  it("夜勤跨ぎ 16:30 - 翌 8:30、深夜中の 60 分休憩を差し引く", () => {
    // 拘束時間中の深夜帯: 7h
    // 休憩 (UTC 14:00 - 15:00 = JST 23:00 - 24:00) は深夜帯と 60 分重なる
    const result = nightMinutes({
      clockInAt: t("2026-05-18T07:30:00Z"),
      clockOutAt: t("2026-05-18T23:30:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T14:00:00Z"), breakEndAt: t("2026-05-18T15:00:00Z") },
      ],
    });
    expect(result).toBe(7 * 60 - 60);
  });

  it("休憩が深夜帯外なら差し引かれない", () => {
    // 18:00-19:00 JST の休憩は深夜外
    const result = nightMinutes({
      clockInAt: t("2026-05-18T07:30:00Z"),
      clockOutAt: t("2026-05-18T23:30:00Z"),
      breakRecords: [
        { breakStartAt: t("2026-05-18T09:00:00Z"), breakEndAt: t("2026-05-18T10:00:00Z") },
      ],
    });
    expect(result).toBe(7 * 60);
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
