import { describe, expect, it } from "vitest";

import {
  allowedActions,
  canPunch,
  deriveState,
  isDebouncing,
  PUNCH_DEBOUNCE_MS,
} from "@/lib/attendance/punch";

const t = (iso: string): Date => new Date(iso);

describe("deriveState", () => {
  it("レコード無し → NONE", () => {
    expect(deriveState(null, [])).toBe("NONE");
  });

  it("clockInAt 未設定 → NONE", () => {
    expect(deriveState({ clockInAt: null, clockOutAt: null }, [])).toBe("NONE");
  });

  it("出勤済・休憩無し → WORKING", () => {
    expect(deriveState({ clockInAt: t("2026-05-18T00:15:00Z"), clockOutAt: null }, [])).toBe(
      "WORKING",
    );
  });

  it("出勤済・休憩中（break_end_at が null） → ON_BREAK", () => {
    const state = deriveState({ clockInAt: t("2026-05-18T00:15:00Z"), clockOutAt: null }, [
      { breakStartAt: t("2026-05-18T03:00:00Z"), breakEndAt: null },
    ]);
    expect(state).toBe("ON_BREAK");
  });

  it("休憩終了済（break_end_at あり） → WORKING", () => {
    const state = deriveState({ clockInAt: t("2026-05-18T00:15:00Z"), clockOutAt: null }, [
      { breakStartAt: t("2026-05-18T03:00:00Z"), breakEndAt: t("2026-05-18T04:00:00Z") },
    ]);
    expect(state).toBe("WORKING");
  });

  it("退勤済 → FINISHED", () => {
    const state = deriveState(
      { clockInAt: t("2026-05-18T00:15:00Z"), clockOutAt: t("2026-05-18T08:00:00Z") },
      [],
    );
    expect(state).toBe("FINISHED");
  });
});

describe("canPunch / allowedActions", () => {
  it("NONE では CLOCK_IN だけ可", () => {
    expect(canPunch("NONE", "CLOCK_IN")).toBe(true);
    expect(canPunch("NONE", "CLOCK_OUT")).toBe(false);
    expect(canPunch("NONE", "BREAK_START")).toBe(false);
    expect(canPunch("NONE", "BREAK_END")).toBe(false);
    expect(allowedActions("NONE")).toEqual(["CLOCK_IN"]);
  });

  it("WORKING では BREAK_START と CLOCK_OUT が可", () => {
    expect(canPunch("WORKING", "BREAK_START")).toBe(true);
    expect(canPunch("WORKING", "CLOCK_OUT")).toBe(true);
    expect(canPunch("WORKING", "CLOCK_IN")).toBe(false);
    expect(canPunch("WORKING", "BREAK_END")).toBe(false);
  });

  it("ON_BREAK では BREAK_END だけ可（退勤は休憩終了後）", () => {
    expect(canPunch("ON_BREAK", "BREAK_END")).toBe(true);
    expect(canPunch("ON_BREAK", "CLOCK_OUT")).toBe(false);
    expect(canPunch("ON_BREAK", "CLOCK_IN")).toBe(false);
  });

  it("FINISHED ではすべて不可", () => {
    expect(allowedActions("FINISHED")).toEqual([]);
  });
});

describe("isDebouncing", () => {
  it("直近の同種打刻が 3 秒以内なら true", () => {
    const now = t("2026-05-18T00:15:02Z");
    const last = t("2026-05-18T00:15:00Z");
    expect(isDebouncing({ lastPunchAt: last, lastSameKindAt: last }, now)).toBe(true);
  });

  it("直近の同種打刻が 3 秒丁度なら false", () => {
    const now = t("2026-05-18T00:15:03Z");
    const last = t("2026-05-18T00:15:00Z");
    expect(isDebouncing({ lastPunchAt: last, lastSameKindAt: last }, now)).toBe(false);
  });

  it("同種の打刻がなければ false", () => {
    const now = t("2026-05-18T00:15:00Z");
    expect(isDebouncing({ lastPunchAt: null, lastSameKindAt: null }, now)).toBe(false);
  });

  it("PUNCH_DEBOUNCE_MS は 3000", () => {
    expect(PUNCH_DEBOUNCE_MS).toBe(3000);
  });
});
