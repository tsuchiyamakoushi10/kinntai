/**
 * 名簿の印刷用 HTML (A4)。純関数。画面のプレビューも cellText を共有する。
 */
import { EMPLOYMENT_TYPE_LABELS, JOB_CATEGORY_LABELS } from "@/lib/employee-labels";
import { formatDate } from "@/lib/format";

import { ageOn, groupByOffice, type RosterEmployee } from "./filter";
import { ROSTER_COLUMN_LABELS, type RosterColumn, type RosterQuery } from "./query";

export const GENDER_LABELS = { MALE: "男", FEMALE: "女", OTHER: "その他" } as const;

export function cellText(e: RosterEmployee, col: RosterColumn, refDate: string): string {
  switch (col) {
    case "kana": {
      const k = [e.lastNameKana, e.firstNameKana].filter(Boolean).join(" ");
      return k || "";
    }
    case "office":
      return e.officeName ?? "";
    case "job":
      return e.jobCategory ? JOB_CATEGORY_LABELS[e.jobCategory] : "";
    case "type":
      return e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : "";
    case "birth":
      return e.birthDate ? formatDate(e.birthDate) : "";
    case "age":
      return e.birthDate ? `${ageOn(e.birthDate, new Date(`${refDate}T00:00:00.000Z`))}歳` : "";
    case "gender":
      return e.gender ? GENDER_LABELS[e.gender] : "";
    case "joined":
      return e.joinedAt ? formatDate(e.joinedAt) : "";
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function jpDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap">';

function css(landscape: boolean): string {
  return `
*{box-sizing:border-box}
body{margin:0;background:#e9e9ec;color:#1d1d1f;font-family:"BIZ UDPGothic",sans-serif;font-size:12.5px;line-height:1.5}
.wrap{padding:24px}
.sheet{background:#fff;max-width:${landscape ? "297mm" : "210mm"};margin:0 auto 24px;padding:32px 36px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:8px}
h1{font-size:19px;margin:0;letter-spacing:.05em}
.office{font-size:14px;font-weight:700;margin:2px 0 0}
.meta{text-align:right;color:#55565b;font-size:11px;white-space:nowrap}
.cond{color:#55565b;font-size:11px;margin:0 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #9a9aa2;padding:5px 7px;text-align:left;vertical-align:middle}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:#f3f3f5;font-size:11px;font-weight:700}
td{height:30px}
td.no,th.no{width:2.6em;text-align:center}
td.name{font-weight:700;white-space:nowrap}
td.s{white-space:nowrap}
th.blank{min-width:6em}
.empty{padding:32px;text-align:center;color:#55565b}
@media print{
  @page{size:A4 ${landscape ? "landscape" : "portrait"};margin:12mm}
  body{background:#fff}
  .wrap{padding:0}
  .sheet{box-shadow:none;max-width:none;padding:0;margin:0;border-radius:0}
  .sheet+.sheet{break-before:page}
}`;
}

function table(rows: RosterEmployee[], q: RosterQuery): string {
  const head =
    `<th class="no">No</th><th>氏名</th>` +
    q.columns.map((c) => `<th>${esc(ROSTER_COLUMN_LABELS[c])}</th>`).join("") +
    q.blanks.map((b) => `<th class="blank">${esc(b)}</th>`).join("");
  const body = rows
    .map(
      (e, i) =>
        `<tr><td class="no">${i + 1}</td><td class="name">${esc(`${e.lastName} ${e.firstName}`)}</td>` +
        q.columns.map((c) => `<td class="s">${esc(cellText(e, c, q.refDate))}</td>`).join("") +
        q.blanks.map(() => "<td></td>").join("") +
        "</tr>",
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export type RosterHtmlInput = {
  query: RosterQuery;
  rows: RosterEmployee[];
  /** 条件の要約 (画面と同じ文言)。 */
  conditionText: string;
  /** 作成日 (YYYY-MM-DD)。 */
  createdOn: string;
};

export function renderRosterHtml({
  query: q,
  rows,
  conditionText,
  createdOn,
}: RosterHtmlInput): string {
  const groups = q.breakByOffice ? groupByOffice(rows) : [{ officeName: "", rows }];
  const sheets =
    rows.length === 0
      ? `<section class="sheet"><h1>${esc(q.title)}</h1><p class="empty">条件に合う人がいません。</p></section>`
      : groups
          .map(
            (g) =>
              `<section class="sheet"><div class="head"><div><h1>${esc(q.title)}</h1>` +
              (g.officeName ? `<p class="office">${esc(g.officeName)}</p>` : "") +
              `</div><div class="meta">作成日 ${jpDate(createdOn)}<br>${g.rows.length} 名</div></div>` +
              (conditionText ? `<p class="cond">${esc(conditionText)}</p>` : "") +
              table(g.rows, q) +
              "</section>",
          )
          .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(q.title)}</title>${FONT_LINK}<style>${css(q.landscape)}</style></head><body><div class="wrap">${sheets}</div></body></html>`;
}
