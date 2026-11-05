/**
 * 昇給通知書 (A4・1 枚、下部に受領欄) の HTML。純関数なので作成画面のプレビューと
 * 印刷画面の両方で同じものを使う。docs/raise-notice.md §3。
 */
import { formatYen } from "@/lib/labor-notice/calc";
import { formatJpDate } from "@/lib/labor-notice/dates";

import { monthlyTotals, UNIT_LABEL, visibleRows } from "./rows";
import type { RaiseView } from "./types";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function diff(before: number, after: number): string {
  const d = after - before;
  if (d === 0) return "変更なし";
  return `${d > 0 ? "+" : "−"}${formatYen(Math.abs(d))}`;
}

const CSS = `
:root{--ink:#1d1d1f;--ink-2:#55565b;--rule:#c9c9cf;--tint:#f3f3f5}
*{box-sizing:border-box}
body{margin:0;background:#e9e9ec;color:var(--ink);font-family:"BIZ UDPGothic",sans-serif;font-size:13px;line-height:1.7}
.wrap{padding:24px}
.sheet{background:#fff;max-width:210mm;margin:0 auto;padding:44px 52px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.right{text-align:right}
.to{font-size:16px;font-weight:700;margin:18px 0 0}
.from{margin-top:6px;font-size:12.5px}
h1{font-family:"BIZ UDPMincho",serif;text-align:center;font-size:24px;letter-spacing:.3em;margin:28px 0 22px}
.lead{margin:0 0 6px}
.ki{text-align:center;margin:14px 0}
dl{display:grid;grid-template-columns:8em 1fr;gap:4px 12px;margin:0 0 12px}
dt{color:var(--ink-2)}
dd{margin:0;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{border:1px solid var(--rule);padding:6px 10px;text-align:left}
th{background:var(--tint);font-size:11.5px;color:var(--ink-2)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.up{font-weight:700}
tr.total td{font-weight:700;background:var(--tint)}
.msg{margin:16px 0 0;white-space:pre-wrap}
.end{text-align:right;margin:12px 0 0}
.cut{margin:34px 0 0;border-top:1px dashed var(--rule);padding-top:14px}
.cut h2{font-size:15px;text-align:center;letter-spacing:.2em;margin:0 0 8px}
.line{display:flex;gap:10px;align-items:flex-end;border-bottom:1px solid var(--ink-2);padding:18px 0 3px;max-width:26em;margin-left:auto}
.line span:first-child{color:var(--ink-2);width:6.5em;flex:none}
.line .seal{margin-left:auto;color:var(--ink-2)}
@media (max-width:640px){.wrap{padding:8px}.sheet{padding:24px 16px}}
@media print{
  @page{size:A4;margin:15mm 16mm}
  body{background:#fff}
  .wrap{padding:0}
  .sheet{box-shadow:none;max-width:none;padding:0;border-radius:0}
}`;

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=BIZ+UDPMincho:wght@400;700&display=swap">';

export function renderRaiseSheet(v: RaiseView): string {
  const rows = visibleRows(v.rows);
  const totals = monthlyTotals(v.kind, rows);
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.label || "手当")}</td><td class="num">${UNIT_LABEL[r.unit]} ${formatYen(r.beforeYen)}</td><td class="num${r.afterYen !== r.beforeYen ? " up" : ""}">${UNIT_LABEL[r.unit]} ${formatYen(r.afterYen)}</td><td class="num">${diff(r.beforeYen, r.afterYen)}</td></tr>`,
    )
    .join("");
  const total =
    totals && rows.length > 1
      ? `<tr class="total"><td>月額の合計</td><td class="num">${formatYen(totals.beforeYen)}</td><td class="num">${formatYen(totals.afterYen)}</td><td class="num">${diff(totals.beforeYen, totals.afterYen)}</td></tr>`
      : "";
  const name = esc(v.employeeName || "　　　　");

  return `<div class="sheet">
<p class="right">${formatJpDate(v.issuedOn)}</p>
<p class="to">${name}　殿</p>
<div class="from right">${esc(v.company.name)}<br>${esc(v.company.representative)}</div>
<h1>昇給通知書</h1>
<p class="lead">このたび、下記のとおり賃金を改定（昇給）することになりましたので通知します。</p>
<p class="ki">記</p>
<dl>
<dt>実施日</dt><dd>${formatJpDate(v.effectiveOn)}から</dd>
<dt>勤務先</dt><dd>${esc(v.officeName)}</dd>
</dl>
<table><thead><tr><th>項目</th><th>変更前</th><th>変更後</th><th>増減</th></tr></thead><tbody>${body}${total}</tbody></table>
${v.message ? `<p class="msg">${esc(v.message)}</p>` : ""}
<p class="end">以上</p>
<div class="cut">
<h2>受領書</h2>
<p>${esc(v.company.name)}　御中</p>
<p>${formatJpDate(v.issuedOn)}付の昇給通知書を受け取りました。</p>
<div class="line"><span>受け取った日</span><span>　　　　年　　　月　　　日</span></div>
<div class="line"><span>氏名（自署）</span><span></span><span class="seal">印</span></div>
</div>
</div>`;
}

/** iframe / 印刷用の完全な HTML 文書 */
export function renderRaiseDocument(v: RaiseView): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>昇給通知書</title>${FONT_LINK}<style>${CSS}</style></head><body><div class="wrap">${renderRaiseSheet(v)}</div></body></html>`;
}
