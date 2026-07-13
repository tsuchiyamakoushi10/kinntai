import { describe, expect, it } from "vitest";

import { resolveCellOfficeId } from "@/lib/shifts/cell-office";

const GRID = "office-grid";
const PRIMARY = "office-grid"; // またぎでない人は primary=グリッド
const SUPPORT = "office-support";

describe("resolveCellOfficeId", () => {
  it("非またぎ行 (勤務先が1つ) の共通記号はグリッドの事業所になる", () => {
    expect(
      resolveCellOfficeId({
        gridOfficeId: GRID,
        spannedOfficeIds: [PRIMARY],
        primaryOfficeId: PRIMARY,
        patternOfficeId: null,
      }),
    ).toBe(GRID);
  });

  it("事業所固有記号は その記号の事業所になる (またぎ行)", () => {
    expect(
      resolveCellOfficeId({
        gridOfficeId: GRID,
        spannedOfficeIds: [PRIMARY, SUPPORT],
        primaryOfficeId: PRIMARY,
        patternOfficeId: SUPPORT,
      }),
    ).toBe(SUPPORT);
  });

  it("またぎ行の共通記号は既定で primary になる", () => {
    expect(
      resolveCellOfficeId({
        gridOfficeId: GRID,
        spannedOfficeIds: [PRIMARY, SUPPORT],
        primaryOfficeId: PRIMARY,
        patternOfficeId: null,
      }),
    ).toBe(PRIMARY);
  });

  it("またぎ行の共通記号は現在の選択事業所を尊重する (トグル後)", () => {
    expect(
      resolveCellOfficeId({
        gridOfficeId: GRID,
        spannedOfficeIds: [PRIMARY, SUPPORT],
        primaryOfficeId: PRIMARY,
        patternOfficeId: null,
        currentOfficeId: SUPPORT,
      }),
    ).toBe(SUPPORT);
  });

  it("現在の選択が spanned 外なら primary にフォールバック", () => {
    expect(
      resolveCellOfficeId({
        gridOfficeId: GRID,
        spannedOfficeIds: [PRIMARY, SUPPORT],
        primaryOfficeId: PRIMARY,
        patternOfficeId: null,
        currentOfficeId: "office-unknown",
      }),
    ).toBe(PRIMARY);
  });
});
