/**
 * 梨花シフト自動生成 (generate.ts) の単体テスト。
 *
 * 設計書 §3 の貪欲法の中核挙動を担保する:
 *   - 休業日は全員公休
 *   - 営業日は配置基準 (午前2/午後2) を満たす
 *   - 正社員を先に終日系で配置、不足をパート/応援で補充
 *   - 個人制約 (益子=半日F午前のみ / 木下=半午午後のみ) を守る
 *   - 希望休は維持、連勤6日を超えない、決定論的
 */
import { describe, expect, it } from "vitest";

import { RIKA_ROSTER } from "@/lib/shift/rika/config";
import { aggregateDay, buildRikaMonth } from "@/lib/shift/rika/grid";
import { generateRikaShifts, type RikaGenMember } from "@/lib/shift/rika/generate";

// 設計書の 6 名をそのまま生成入力に変換。
const MEMBERS: RikaGenMember[] = RIKA_ROSTER.map((m) => ({
  id: m.name,
  employmentClass: m.employmentClass,
  isHelper: m.isHelper ?? false,
  allowedSymbols: m.allowedSymbols,
  targetWorkDays: m.targetWorkDays ?? null,
}));

const YM = "2025-12"; // 12-01 は月曜
const days = buildRikaMonth(YM);
const businessDays = days.filter((d) => d.isBusinessDay).map((d) => d.date);
const closedDays = days.filter((d) => !d.isBusinessDay).map((d) => d.date);

describe("generateRikaShifts", () => {
  const { cells, warnings } = generateRikaShifts(YM, MEMBERS);
  const byKey = new Map(cells.map((c) => [`${c.memberId}|${c.date}`, c.symbol]));

  it("全 職員 × 全日 のセルを返す", () => {
    expect(cells).toHaveLength(MEMBERS.length * days.length);
  });

  it("休業日は全員公休", () => {
    for (const date of closedDays) {
      for (const m of MEMBERS) {
        expect(byKey.get(`${m.id}|${date}`)).toBe("OFF");
      }
    }
  });

  it("営業日は配置基準 午前2/午後2 を満たす", () => {
    for (const date of businessDays) {
      const { am, pm } = aggregateDay(cells, date);
      expect(am, `am ${date}`).toBeGreaterThanOrEqual(2);
      expect(pm, `pm ${date}`).toBeGreaterThanOrEqual(2);
    }
    // この人員構成なら不足警告は出ないはず。
    expect(warnings.filter((w) => w.code === "UNDERSTAFFED")).toHaveLength(0);
  });

  it("個人制約を守る: 益子は半日Fのみ、木下は半午のみ (勤務日)", () => {
    for (const date of businessDays) {
      const masuko = byKey.get(`益子紗生里|${date}`);
      if (masuko && masuko !== "OFF" && masuko !== "REQUESTED_OFF") {
        expect(masuko).toBe("HALF_F");
      }
      const kinoshita = byKey.get(`木下潤平|${date}`);
      if (kinoshita && kinoshita !== "OFF" && kinoshita !== "REQUESTED_OFF") {
        expect(kinoshita).toBe("HALF_PM");
      }
    }
  });

  it("常勤の正社員 (五木田) は営業日に終日系で勤務する", () => {
    const fullday = new Set(["DAY_CARE", "RK_3", "RK_4", "RK_5"]);
    let worked = 0;
    for (const date of businessDays) {
      const sym = byKey.get(`五木田秀美|${date}`);
      if (sym && fullday.has(sym)) worked += 1;
    }
    // 連勤上限で一部公休になるが、過半は勤務しているはず。
    expect(worked).toBeGreaterThan(businessDays.length / 2);
  });

  it("希望休は維持される", () => {
    const reqOff = { 菅原知美: [businessDays[0]!, businessDays[1]!] };
    const r = generateRikaShifts(YM, MEMBERS, reqOff);
    const m = new Map(r.cells.map((c) => [`${c.memberId}|${c.date}`, c.symbol]));
    expect(m.get(`菅原知美|${businessDays[0]}`)).toBe("REQUESTED_OFF");
    expect(m.get(`菅原知美|${businessDays[1]}`)).toBe("REQUESTED_OFF");
  });

  it("連勤は6日を超えない", () => {
    for (const m of MEMBERS) {
      let run = 0;
      for (const d of days) {
        const sym = byKey.get(`${m.id}|${d.date}`);
        const isWork = sym != null && sym !== "OFF" && sym !== "REQUESTED_OFF";
        run = isWork ? run + 1 : 0;
        expect(run, `${m.id} ${d.date}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("決定論的: 同じ入力なら同じ結果", () => {
    const a = generateRikaShifts(YM, MEMBERS);
    const b = generateRikaShifts(YM, MEMBERS);
    expect(a.cells).toEqual(b.cells);
  });

  it("希望休枠超過を警告する (パート5日まで)", () => {
    const reqOff = { 須永加寿美: businessDays.slice(0, 6) };
    const r = generateRikaShifts(YM, MEMBERS, reqOff);
    expect(
      r.warnings.some((w) => w.code === "REQUEST_OFF_OVER_QUOTA" && w.memberId === "須永加寿美"),
    ).toBe(true);
  });
});
