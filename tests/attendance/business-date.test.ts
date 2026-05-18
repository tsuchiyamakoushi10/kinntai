import { describe, expect, it } from "vitest";

import { fromJstYmd, todayJstDate, todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";

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
