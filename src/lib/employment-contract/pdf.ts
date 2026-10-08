/**
 * HTML テンプレを Chromium で PDF にレンダリングする。
 *
 * 実行環境で 2 系統を切り替える:
 * - Vercel / Lambda (serverless): puppeteer-core + @sparticuz/chromium。
 *   バイナリサイズが小さく Lambda の 250MB 制限内に収まる。
 * - ローカル / Codespaces / 自前サーバ: Playwright の Chromium。
 *   IPAGothic / WenQuanYi Zen Hei / Noto Sans CJK JP のフォントが効く。
 */
import type { ContractViewModel } from "./data";
import { renderContractHtml } from "./html-template";

type PdfOptions = {
  format: "A4";
  printBackground: boolean;
  margin?: { top: string; bottom: string; left: string; right: string };
  preferCSSPageSize?: boolean;
};

const PDF_OPTIONS: PdfOptions = {
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
};

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** 1 契約分の PDF を Buffer で返す。 */
export async function renderContractPdf(vm: ContractViewModel): Promise<Buffer> {
  return renderHtmlToPdf(renderContractHtml(vm), PDF_OPTIONS);
}

/**
 * 任意の HTML 文書を PDF にする。余白を CSS の @page で決める帳票は
 * `{ format: "A4", printBackground: true, preferCSSPageSize: true }` を渡す。
 */
export async function renderHtmlToPdf(html: string, options: PdfOptions): Promise<Buffer> {
  return isServerless() ? renderWithPuppeteer(html, options) : renderWithPlaywright(html, options);
}

async function renderWithPlaywright(html: string, options: PdfOptions): Promise<Buffer> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf(options);
  } finally {
    await browser.close();
  }
}

async function renderWithPuppeteer(html: string, options: PdfOptions): Promise<Buffer> {
  const [{ default: chromium }, puppeteer] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core"),
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    // puppeteer-core の setContent は networkidle 系を受け付けないため
    // load + document.fonts.ready で Google Fonts (Noto Sans JP) の到着を待つ
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf(options);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
