/**
 * 梨花 希望休まとめ入力 (requests.ts) の単体テスト。
 *
 * 設計書 §5: 紙で集めた希望休を、シフトを組む前にまとめて取り込む。
 *   - 氏名 + 日付リストの 1 行形式 (CSV 貼り付け / 手入力 共通)
 *   - 完全一致 / 部分一致での氏名解決、日番号・フル日付の両対応
 *   - 営業日のみ採用 (休業日は注記)、無効日付・未知職員・重複・氏名のみ は注記
 *   - 全角の区切り/数字も受ける、出力は昇順で決定論的
 */
import { describe, expect, it } from "vitest";

import { RIKA_ROSTER } from "@/lib/shift/rika/config";
import { parseRequestOff } from "@/lib/shift/rika/requests";

const YM = "2025-12"; // 12-01 は月曜 (営業日)。12-03 は水曜 (休業日)。
const memberIds = RIKA_ROSTER.map((m) => m.name);
const parse = (text: string) => parseRequestOff(text, { ym: YM, memberIds });

describe("parseRequestOff", () => {
  it("氏名 + 日番号 を希望休に変換する", () => {
    const { requests, notes } = parse("五木田秀美 1 2");
    expect(requests["五木田秀美"]).toEqual(["2025-12-01", "2025-12-02"]);
    expect(notes).toHaveLength(0);
  });

  it("部分一致 (姓のみ) で 1 名に絞れたら採用する", () => {
    const { requests } = parse("五木田 4");
    expect(requests["五木田秀美"]).toEqual(["2025-12-04"]);
  });

  it("YYYY-MM-DD 形式の日付も受け付ける", () => {
    const { requests } = parse("菅原知美 2025-12-05");
    expect(requests["菅原知美"]).toEqual(["2025-12-05"]);
  });

  it("区切り・数字が全角でも解釈する", () => {
    const { requests, notes } = parse("横野千波：１、２");
    expect(requests["横野千波"]).toEqual(["2025-12-01", "2025-12-02"]);
    expect(notes).toHaveLength(0);
  });

  it("休業日 (水曜) は採用せず NON_BUSINESS_DAY 注記を出す", () => {
    const { requests, notes } = parse("菅原知美 3");
    expect(requests["菅原知美"]).toBeUndefined();
    expect(notes).toEqual([
      { line: 1, kind: "NON_BUSINESS_DAY", memberId: "菅原知美", date: "2025-12-03" },
    ]);
  });

  it("未知の氏名は UNKNOWN_MEMBER 注記", () => {
    const { requests, notes } = parse("田中 1");
    expect(requests).toEqual({});
    expect(notes[0]).toMatchObject({ kind: "UNKNOWN_MEMBER", text: "田中" });
  });

  it("複数名にマッチする氏名は AMBIGUOUS_MEMBER 注記 (採用しない)", () => {
    // 「美」は 五木田秀美 / 菅原知美 / 須永加寿美 にマッチ。
    const { requests, notes } = parse("美 1");
    expect(requests).toEqual({});
    const note = notes[0];
    expect(note?.kind).toBe("AMBIGUOUS_MEMBER");
    if (note?.kind === "AMBIGUOUS_MEMBER") {
      expect(note.matches.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("範囲外/不正な日付は INVALID_DATE 注記", () => {
    const { requests, notes } = parse("菅原知美 99 2025-11-05 xx");
    expect(requests["菅原知美"]).toBeUndefined();
    expect(notes.every((n) => n.kind === "INVALID_DATE")).toBe(true);
    expect(notes).toHaveLength(3);
  });

  it("同一職員・同一日の重複は 1 回だけ採用し DUPLICATE 注記", () => {
    const { requests, notes } = parse("菅原知美 1 1");
    expect(requests["菅原知美"]).toEqual(["2025-12-01"]);
    expect(notes).toEqual([
      { line: 1, kind: "DUPLICATE", memberId: "菅原知美", date: "2025-12-01" },
    ]);
  });

  it("氏名だけで日付が無い行は NO_DATES 注記", () => {
    const { requests, notes } = parse("五木田秀美");
    expect(requests).toEqual({});
    expect(notes[0]).toMatchObject({ kind: "NO_DATES", text: "五木田秀美" });
  });

  it("空行は無視し、複数行・複数職員をまとめて処理する", () => {
    const { requests } = parse("五木田秀美 1\n\n菅原知美 2 4");
    expect(requests).toEqual({
      五木田秀美: ["2025-12-01"],
      菅原知美: ["2025-12-02", "2025-12-04"],
    });
  });

  it("出力日付は昇順 (決定論的)", () => {
    const { requests } = parse("菅原知美 5 1 2");
    expect(requests["菅原知美"]).toEqual(["2025-12-01", "2025-12-02", "2025-12-05"]);
  });
});
