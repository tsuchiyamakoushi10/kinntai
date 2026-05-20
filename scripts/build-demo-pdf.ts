/**
 * docs/demo-guide.md を docs/demo-guide.pdf に書き出す。
 *
 * 実行: `pnpm docs:pdf`
 *
 * 流れ:
 *   1. demo-guide.md を読む
 *   2. marked で HTML に変換
 *   3. 日本語フォント (IPAGothic + WenQuanYi Zen Hei) を効かせる
 *      スタイルでラップ
 *   4. Playwright の Chromium を起動し、HTML を Page にセット
 *   5. A4 縦で page.pdf() を取得し docs/demo-guide.pdf に保存
 *
 * 仕様メモ:
 *   - 既に Playwright を E2E 用にインストール済みなので追加依存なし
 *   - 出力 PDF は gitignore 対象 (実行時に毎回生成)
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { marked } from "marked";

const ROOT = resolve(__dirname, "..");
const MD_PATH = resolve(ROOT, "docs/demo-guide.md");
const PDF_PATH = resolve(ROOT, "docs/demo-guide.pdf");

const CSS = `
@page { size: A4; margin: 18mm 16mm; }

html, body {
  font-family: "IPAGothic", "WenQuanYi Zen Hei", "Noto Sans CJK JP", sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1f2937;
}
h1 { font-size: 18pt; border-bottom: 2px solid #1f2937; padding-bottom: 4pt; margin-top: 0; }
h2 { font-size: 13pt; margin-top: 18pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 2pt; }
h3 { font-size: 11.5pt; margin-top: 12pt; color: #0f172a; }
h4 { font-size: 10.5pt; margin-top: 10pt; }
p, li { font-size: 10.5pt; }
ul, ol { padding-left: 1.2em; }
li { margin: 2pt 0; }
hr { border: 0; border-top: 1px dashed #94a3b8; margin: 12pt 0; }

code {
  font-family: "DejaVu Sans Mono", monospace;
  background: #f1f5f9;
  padding: 1pt 4pt;
  border-radius: 3pt;
  font-size: 9.5pt;
}
pre {
  background: #0f172a;
  color: #f8fafc;
  padding: 8pt 10pt;
  border-radius: 4pt;
  overflow-x: auto;
  page-break-inside: avoid;
}
pre code { background: transparent; color: inherit; font-size: 9pt; }

table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; font-size: 10pt; vertical-align: top; }
th { background: #f1f5f9; }

blockquote {
  margin: 8pt 0;
  padding: 6pt 10pt;
  border-left: 3pt solid #94a3b8;
  background: #f8fafc;
  font-size: 10pt;
}

a { color: #0f172a; text-decoration: underline; }
strong { color: #0f172a; }
`;

async function main(): Promise<void> {
  const md = await readFile(MD_PATH, "utf-8");
  const body = marked.parse(md, { async: false }) as string;
  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>kinntai demo guide</title><style>${CSS}</style></head>
<body>${body}</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
    });
    await writeFile(PDF_PATH, pdf);
    console.log(`wrote ${PDF_PATH} (${pdf.length.toLocaleString()} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
