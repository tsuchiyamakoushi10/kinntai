/**
 * HTML テンプレを Playwright Chromium で PDF にレンダリングする。
 *
 * scripts/build-demo-pdf.ts と同じスタックを使い、A4 縦・日本語フォント
 * (IPAGothic / WenQuanYi Zen Hei / Noto Sans CJK JP) を効かせる。
 * 既存 docs:pdf で導入済の依存だけで動く (追加 npm パッケージ不要)。
 */
import type { ContractViewModel } from "./data";
import { renderContractHtml } from "./html-template";

/** 1 契約分の PDF を Buffer で返す。 */
export async function renderContractPdf(vm: ContractViewModel): Promise<Buffer> {
  const fullHtml = renderContractHtml(vm);

  // Playwright は重いので、リクエスト時に動的 import (起動コスト削減)。
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
