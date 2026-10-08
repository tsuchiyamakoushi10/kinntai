import { describe, expect, it } from "vitest";

import { computeNotice } from "@/lib/labor-notice/compute";
import { renderNoticeSheets } from "@/lib/labor-notice/html";

import { fullTimeInput, masters, nightOnlyInput, partTimeInput } from "./fixtures";

function render(
  input: Parameters<typeof computeNotice>[0],
  preview = false,
  noticeNo: string | null = "CH-2026-0001",
) {
  const { view } = computeNotice(input, masters());
  if (!view) throw new Error("view is null");
  return renderNoticeSheets(view, { noticeNo, preview });
}

describe("帳票 HTML", () => {
  it("3 枚構成で、全ページに通知書番号が入る", () => {
    const html = render(partTimeInput());
    expect(html.match(/<article class="sheet">/g)).toHaveLength(3);
    expect(html.match(/CH-2026-0001/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("1 / 3");
    expect(html).toContain("3 / 3");
  });

  it("交付用 (preview=false) には「2024改正」バッジを出さない", () => {
    expect(render(partTimeInput())).not.toContain("2024改正");
    expect(render(partTimeInput(), true)).toContain("2024改正");
  });

  it("下書きは番号の代わりに「発行時に採番」と表示", () => {
    expect(render(partTimeInput(), true, null)).toContain("（発行時に採番）");
  });

  it("パート: 09欄に無期切替日、根拠法にパート有期法", () => {
    const html = render(partTimeInput());
    expect(html).toContain("2027年5月1日から");
    expect(html).toContain("パートタイム・有期雇用労働法第6条");
  });

  it("正社員: 09欄なし・試用期間あり", () => {
    const html = render(fullTimeInput());
    expect(html).not.toContain('<span class="n">09</span>');
    expect(html).toContain("試用期間");
    expect(html).toContain("本書は労働基準法第15条に基づく");
  });

  it("夜勤専従: 内訳と2暦日の注記", () => {
    const html = render(nightOnlyInput({ patternCodes: ["NIGHT", "SHORT_NIGHT"] }));
    expect(html).toContain("基本日給 17,777円（1時間あたり 1269.8円）＋ 深夜割増賃金 2,223円");
    expect(html).toContain("基本日給 17,254円");
    expect(html).toContain("2日分として扱う");
  });

  it("氏名などはエスケープされる", () => {
    const html = render(partTimeInput({ employeeName: "<script>x</script>" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
