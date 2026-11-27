import { describe, expect, it } from "vitest";

import { socialInsuranceText } from "@/lib/employment-contract/html-template";

describe("socialInsuranceText (契約書の社会保険欄)", () => {
  it("両方加入", () => {
    expect(socialInsuranceText(true, true)).toBe("健康保険・厚生年金 加入");
  });
  it("70 歳以上: 健保だけ", () => {
    expect(socialInsuranceText(true, false)).toBe("健康保険 加入");
  });
  it("どちらもなし・未設定", () => {
    expect(socialInsuranceText(false, false)).toBe("加入なし");
    expect(socialInsuranceText(null, null)).toBe("加入なし");
  });
});
