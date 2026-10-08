/**
 * docs/manual/*.md を印刷用の PDF にする (表紙・目次・画面写真つき)。
 *
 * 実行: pnpm manual:pdf
 * 出力: dist/manual/CrossShift_管理者マニュアル.pdf / CrossShift_職員マニュアル.pdf
 *
 * 画面写真は dist/manual/images (pnpm manual:capture で作る) を読む。
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { marked } from "marked";

const ROOT = resolve(__dirname, "../..");
const OUT = join(ROOT, "dist/manual");

const BOOKS = [
  {
    src: "docs/manual/admin.md",
    out: "CrossShift_管理者マニュアル.pdf",
    label: "管理者（社長・事業所の管理者）向け",
  },
  { src: "docs/manual/staff.md", out: "CrossShift_職員マニュアル.pdf", label: "職員向け" },
];

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
html, body { font-family: "Noto Sans CJK JP", "IPAGothic", sans-serif; color: #1f2937; font-size: 11pt; line-height: 1.7; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover .brand { font-size: 14pt; letter-spacing: .3em; color: #475569; }
.cover h1 { font-size: 30pt; border: 0; margin: 8pt 0 4pt; }
.cover .for { font-size: 15pt; color: #0f172a; }
.cover .date { margin-top: 30pt; color: #64748b; font-size: 10.5pt; }
.toc { page-break-after: always; }
.toc h2 { border: 0; }
.toc ol { font-size: 12pt; line-height: 2; }
h1 { font-size: 20pt; border-bottom: 3px solid #0f172a; padding-bottom: 4pt; margin-top: 0; page-break-before: always; }
h1:first-of-type { page-break-before: auto; }
h2 { font-size: 14.5pt; margin-top: 20pt; padding: 4pt 8pt; background: #f1f5f9; border-left: 5pt solid #0369a1; page-break-after: avoid; }
h3 { font-size: 12pt; margin-top: 14pt; color: #0f172a; page-break-after: avoid; }
p, li { font-size: 11pt; }
ol, ul { padding-left: 1.4em; }
li { margin: 3pt 0; }
img { display: block; max-width: 100%; max-height: 120mm; margin: 8pt auto; border: 1px solid #cbd5e1; border-radius: 4pt; page-break-inside: avoid; }
img[alt*="スマホ"] { max-height: 130mm; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; page-break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; vertical-align: top; font-size: 10.5pt; }
th { background: #f1f5f9; }
blockquote { margin: 10pt 0; padding: 8pt 12pt; border-left: 4pt solid #f59e0b; background: #fffbeb; page-break-inside: avoid; }
blockquote p { margin: 2pt 0; }
code { font-family: "Noto Sans Mono CJK JP", monospace; background: #f1f5f9; padding: 1pt 4pt; border-radius: 3pt; }
strong { color: #0f172a; }
.video { display: inline-block; margin: 2pt 0 6pt; padding: 3pt 8pt; border: 1px solid #0369a1; border-radius: 10pt; color: #0369a1; font-size: 9.5pt; }
`;

function today(): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "long" }).format(
    new Date(),
  );
}

async function inlineImages(html: string): Promise<string> {
  const srcs = [...new Set([...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]!))];
  let out = html;
  for (const src of srcs) {
    const file = join(OUT, decodeURI(src));
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      throw new Error(
        `画面写真がありません: ${file}（先に pnpm manual:capture を実行してください）`,
      );
    }
    out = out.split(`src="${src}"`).join(`src="data:image/png;base64,${data.toString("base64")}"`);
  }
  return out;
}

async function build(book: (typeof BOOKS)[number]): Promise<void> {
  const md = await readFile(join(ROOT, book.src), "utf-8");
  // 「🎬 動画: xxx」行を目印のバッジにする
  const body = (marked.parse(md, { async: false }) as string).replace(
    /<p>🎬 動画[:：]\s*(.+?)<\/p>/g,
    '<p class="video">🎬 操作動画：$1</p>',
  );
  const chapters = [...md.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
  // 画面写真は PDF の中に埋め込む (file:// の読み込みはブラウザに止められるため)
  const withImages = await inlineImages(body);
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <section class="cover">
    <div class="brand">CrossShift 結いの心</div>
    <h1>操作マニュアル</h1>
    <div class="for">${book.label}</div>
    <div class="date">${today()} 版</div>
  </section>
  <section class="toc"><h2>目次</h2><ol>${chapters.map((c) => `<li>${c}</li>`).join("")}</ol></section>
  ${withImages}
  </body></html>`;

  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8pt;color:#94a3b8;text-align:center;font-family:'Noto Sans CJK JP'">CrossShift 操作マニュアル（${book.label}）　<span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
    });
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, book.out), pdf);
    console.log(`wrote ${book.out} (${Math.round(pdf.length / 1024)} KB)`);
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  for (const b of BOOKS) await build(b);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
