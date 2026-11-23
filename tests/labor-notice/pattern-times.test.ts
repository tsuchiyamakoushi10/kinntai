/**
 * 通知書ごとの勤務時間の書き換え (patternTimes)。設定の勤務パターンより優先する。
 */
import { describe, expect, it } from "vitest";

import { computeNotice } from "@/lib/labor-notice/compute";
import { applyPreset } from "@/lib/labor-notice/defaults";
import { parseNoticeInput } from "@/lib/labor-notice/parse";

import { masters, nightOnlyInput, partTimeInput } from "./fixtures";

describe("通知書ごとの勤務時間の書き換え", () => {
  it("書き換えが無ければ設定どおり (半日勤務 9:00〜12:00 → 3時間)", () => {
    const r = computeNotice(partTimeInput({ patternCodes: ["HALF_DAY"] }), masters());
    expect(r.view?.patterns).toEqual([
      { label: "半日勤務", start: "9:00", end: "12:00", breakMinutes: 0, workHours: 3 },
    ]);
  });

  it("書き換えた時間が書面と実働に反映される (9:00〜14:00 休憩30分 → 4.5時間)", () => {
    const r = computeNotice(
      partTimeInput({
        patternCodes: ["HALF_DAY"],
        patternTimes: {
          HALF_DAY: { start: "09:00", end: "14:00", endsNextDay: false, breakMinutes: 30 },
        },
      }),
      masters(),
    );
    expect(r.errors).toEqual([]);
    expect(r.view?.patterns).toEqual([
      { label: "半日勤務", start: "9:00", end: "14:00", breakMinutes: 30, workHours: 4.5 },
    ]);
  });

  it("選んでいないパターンの書き換えは書面に出ない", () => {
    const r = computeNotice(
      partTimeInput({
        patternCodes: ["DAY"],
        patternTimes: {
          HALF_DAY: { start: "09:00", end: "14:00", endsNextDay: false, breakMinutes: 30 },
        },
      }),
      masters(),
    );
    expect(r.view?.patterns.map((p) => p.label)).toEqual(["日勤"]);
  });

  it("夜勤専従の日給の分解は書き換え後の実働で計算する (16:30〜翌9:30 休憩120分 → 15時間)", () => {
    const r = computeNotice(
      nightOnlyInput({
        patternTimes: {
          NIGHT: { start: "16:30", end: "09:30", endsNextDay: true, breakMinutes: 120 },
        },
      }),
      masters(),
    );
    expect(r.view?.patterns[0]?.workHours).toBe(15);
  });

  it("終わりが始まりより前で「翌日」なしはエラー", () => {
    const r = computeNotice(
      partTimeInput({
        patternCodes: ["DAY"],
        patternTimes: {
          DAY: { start: "17:00", end: "09:00", endsNextDay: false, breakMinutes: 60 },
        },
      }),
      masters(),
    );
    expect(r.errors.map((e) => e.field)).toContain("patternTimes");
  });

  it("区分を選び直すと書き換えは消える", () => {
    const prev = partTimeInput({
      patternTimes: {
        DAY: { start: "09:00", end: "18:00", endsNextDay: false, breakMinutes: 60 },
      },
    });
    const next = applyPreset("FULL_TIME", prev, masters().presets.FULL_TIME);
    expect(next.patternTimes).toEqual({});
  });
});

describe("parseNoticeInput の patternTimes", () => {
  it("項目の無い古い下書きは {} で読める", () => {
    const { patternTimes: _omit, ...legacy } = partTimeInput();
    void _omit;
    expect(parseNoticeInput(JSON.parse(JSON.stringify(legacy)))?.patternTimes).toEqual({});
  });

  it("書き換えはそのまま読める", () => {
    const patternTimes = {
      DAY: { start: "09:00", end: "18:00", endsNextDay: false, breakMinutes: 45 },
    };
    expect(parseNoticeInput({ ...partTimeInput(), patternTimes })?.patternTimes).toEqual(
      patternTimes,
    );
  });

  it("時刻の形が違うと読めない", () => {
    const bad = { DAY: { start: "9:00", end: "18:00", endsNextDay: false, breakMinutes: 60 } };
    expect(parseNoticeInput({ ...partTimeInput(), patternTimes: bad })).toBeNull();
    const badBreak = {
      DAY: { start: "09:00", end: "18:00", endsNextDay: false, breakMinutes: 300 },
    };
    expect(parseNoticeInput({ ...partTimeInput(), patternTimes: badBreak })).toBeNull();
  });
});
