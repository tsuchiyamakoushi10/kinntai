import { describe, expect, it } from "vitest";

import {
  currentJstYm,
  fromJstYmd,
  monthRange,
  todayJstDate,
  todayJstYmd,
  toJstYmd,
} from "@/lib/attendance/business-date";

describe("toJstYmd", () => {
  it("UTC 0 時を JST の翌日 9 時として扱う", () => {
    // UTC 2026-05-18 00:00 = JST 2026-05-18 09:00 → 同日扱い
    expect(toJstYmd(new Date("2026-05-18T00:00:00Z"))).toBe("2026-05-18");
  });

  it("UTC 15 時を JST の翌日 0 時として扱う（日付が繰り上がる）", () => {
    // UTC 2026-05-18 15:00 = JST 2026-05-19 00:00
    expect(toJstYmd(new Date("2026-05-18T15:00:00Z"))).toBe("2026-05-19");
  });

  it("UTC 14:59 はまだ JST の前日 23:59 のまま", () => {
    expect(toJstYmd(new Date("2026-05-18T14:59:59Z"))).toBe("2026-05-18");
  });

  it("夜勤明け 8:30 JST は同じ業務日扱いではなく翌暦日になる（業務日付の判定は呼び出し側）", () => {
    // 業務日付の「翌日への送り」は punch ロジック側で決める。
    // ここでは純粋な暦日変換だけ確認する。
    // JST 2026-05-19 08:30 = UTC 2026-05-18 23:30
    expect(toJstYmd(new Date("2026-05-18T23:30:00Z"))).toBe("2026-05-19");
  });
});

describe("fromJstYmd", () => {
  it("YYYY-MM-DD を UTC 0 時として返す", () => {
    const d = fromJstYmd("2026-05-18");
    expect(d.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });

  it("不正なフォーマットは例外", () => {
    expect(() => fromJstYmd("2026/05/18")).toThrow();
    expect(() => fromJstYmd("")).toThrow();
    expect(() => fromJstYmd("2026-5-1")).toThrow();
  });
});

describe("todayJstYmd / todayJstDate", () => {
  it("指定された now の JST 日付を返す", () => {
    const now = new Date("2026-05-18T16:00:00Z"); // JST 2026-05-19 01:00
    expect(todayJstYmd(now)).toBe("2026-05-19");
    expect(todayJstDate(now).toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });
});

describe("currentJstYm", () => {
  it("UTC 15 時で日付が JST に翌日繰り上がっても YYYY-MM を返す", () => {
    expect(currentJstYm(new Date("2026-05-18T15:00:00Z"))).toBe("2026-05-19".slice(0, 7));
  });
  it("年末跨ぎ: JST 1/1 に入った直後", () => {
    // UTC 2025-12-31 15:00 = JST 2026-01-01 00:00
    expect(currentJstYm(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01");
  });
});

describe("monthRange", () => {
  it("31 日ある月は 31 日分の日付を返す", () => {
    const r = monthRange("2026-05");
    expect(r.days.length).toBe(31);
    expect(r.days[0]).toBe("2026-05-01");
    expect(r.days.at(-1)).toBe("2026-05-31");
  });

  it("30 日の月は 30 日まで", () => {
    expect(monthRange("2026-04").days.length).toBe(30);
  });

  it("うるう年の 2 月は 29 日 (2028 年)", () => {
    expect(monthRange("2028-02").days.length).toBe(29);
  });

  it("平年の 2 月は 28 日", () => {
    expect(monthRange("2026-02").days.length).toBe(28);
  });

  it("start / end / prevYm / nextYm が一致する", () => {
    const r = monthRange("2026-05");
    expect(r.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.prevYm).toBe("2026-04");
    expect(r.nextYm).toBe("2026-06");
  });

  it("12 月の翌月は翌年 1 月、1 月の前月は前年 12 月", () => {
    expect(monthRange("2026-12").nextYm).toBe("2027-01");
    expect(monthRange("2026-12").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthRange("2026-01").prevYm).toBe("2025-12");
  });

  it("不正フォーマットは例外", () => {
    expect(() => monthRange("2026-13")).toThrow();
    expect(() => monthRange("2026-5")).toThrow();
    expect(() => monthRange("")).toThrow();
  });
});
