/**
 * 梨花メンバー突合 (resolveRikaMembers / belongsToRika) の単体テスト。
 *
 * 設計書 §1 の抽出条件「拠点コード==RIKA または 兼務先に RIKA を含む」を
 * 社員マスター_シフト用.csv の 2026-06-03 時点の値で担保する。
 * あわせて、氏名タイプミス時の代替突合・未発見などの分岐も別フィクスチャで確認する。
 */
import { describe, expect, it } from "vitest";

import { RIKA_ROSTER } from "@/lib/shift/rika/config";
import { belongsToRika, resolveRikaMembers, type MasterRow } from "@/lib/shift/rika/members";

const row = (
  name: string,
  officeCode: string,
  kenmuSaki: string,
  employmentType: string,
): MasterRow => ({ name, officeCode, kenmuSaki, employmentType, jobCategory: "" });

// 社員マスター_シフト用.csv の梨花関連行を模したフィクスチャ。
const MASTER: ReadonlyArray<MasterRow> = [
  row("五木田秀美", "RIKA", "", "FULL_TIME"),
  row("菅原知美", "RIKA", "", "PART_TIME"),
  row("須永加寿美", "RIKA", "", "PART_TIME"),
  row("益子紗生里", "RIKA", "", "PART_TIME"),
  row("横野千波", "DEY", "RIKA", "PART_TIME"),
  row("木下潤平", "NH", "NH(午前)・DEY(午後)・RIKA(午後)", "FULL_TIME"),
  // 誤突合チェック用ノイズ (同姓 別人 / 無関係)。
  row("木下拓哉", "SHORT", "", "FULL_TIME"),
  row("木下理菜", "KITCHEN", "", "FULL_TIME"),
  row("中村直子", "NH", "", "FULL_TIME"),
];

describe("belongsToRika", () => {
  it("拠点コード RIKA は対象", () => {
    expect(belongsToRika({ officeCode: "RIKA", kenmuSaki: "" })).toBe(true);
  });
  it("兼務先に RIKA を含めば対象 (拠点が別でも)", () => {
    expect(belongsToRika({ officeCode: "DEY", kenmuSaki: "RIKA" })).toBe(true);
    expect(belongsToRika({ officeCode: "NH", kenmuSaki: "NH(午前)・DEY(午後)・RIKA(午後)" })).toBe(
      true,
    );
  });
  it("どちらにも RIKA がなければ対象外", () => {
    expect(belongsToRika({ officeCode: "SHORT", kenmuSaki: "" })).toBe(false);
  });
});

describe("resolveRikaMembers (シフト用マスター)", () => {
  const resolved = resolveRikaMembers(MASTER);
  const byName = new Map(resolved.map((r) => [r.roster.name, r]));

  it("ロスター 6 名すべてを返す", () => {
    expect(resolved).toHaveLength(RIKA_ROSTER.length);
    expect(resolved).toHaveLength(6);
  });

  it("RIKA 直属の 4 名は食い違いなしで解決する", () => {
    for (const name of ["五木田秀美", "菅原知美", "須永加寿美", "益子紗生里"]) {
      const r = byName.get(name)!;
      expect(r.exactNameMatch).toBe(true);
      expect(r.master?.officeCode).toBe("RIKA");
      expect(r.discrepancies).toHaveLength(0);
    }
  });

  it("兼務応援者 (横野・木下) は『兼務応援』として注記する", () => {
    for (const name of ["横野千波", "木下潤平"]) {
      const r = byName.get(name)!;
      expect(r.discrepancies.some((d) => d.includes("兼務応援"))).toBe(true);
      expect(r.discrepancies.some((d) => d.includes("拠点コード不一致"))).toBe(false);
    }
  });

  it("同姓が複数いる木下潤平は完全一致で本人に突合する (誤突合しない)", () => {
    const r = byName.get("木下潤平")!;
    expect(r.exactNameMatch).toBe(true);
    expect(r.master?.name).toBe("木下潤平");
  });
});

describe("resolveRikaMembers (突合分岐)", () => {
  it("氏名タイプミス時は姓の前方一致で代替突合し、氏名不一致を注記する", () => {
    // 益子紗生里 を 益子妙生里 と取り違えたマスターを与える。
    const master = [row("益子妙生里", "RIKA", "", "PART_TIME")];
    const r = resolveRikaMembers(master).find((x) => x.roster.name === "益子紗生里")!;
    expect(r.exactNameMatch).toBe(false);
    expect(r.master?.name).toBe("益子妙生里");
    expect(r.discrepancies.some((d) => d.includes("氏名不一致"))).toBe(true);
  });

  it("該当者がいなければ notFound 注記を返す", () => {
    const r = resolveRikaMembers([])[0]!;
    expect(r.master).toBeNull();
    expect(r.discrepancies.some((d) => d.includes("見つかりません"))).toBe(true);
  });
});
