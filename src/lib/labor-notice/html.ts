/**
 * 労働条件通知書 (2 枚) + 雇用契約 同意書 兼 受領書 (1 枚) の HTML。
 *
 * 仕様書添付の labor-notice-prototype.html の render() を移植したもの。純関数なので
 * 作成画面のライブプレビュー (iframe srcDoc) と PDF 生成の両方で同じものを使う。
 * docs/labor-notice.md §5 参照。
 */
import { formatYen, round1 } from "./calc";
import { formatJpDate, formatSlashDate } from "./dates";
import type { NoticeView } from "./types";

export type RenderOptions = {
  /** 通知書番号。下書きは null (「発行時に採番」と表示) */
  noticeNo: string | null;
  /** 画面プレビュー用。true のとき「2024改正」バッジと「下書き」表示を出す */
  preview: boolean;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** 値をエスケープして埋め込むタグ関数。HTML 断片は raw() で包んで渡す。 */
class Raw {
  constructor(readonly html: string) {}
}
function raw(html: string): Raw {
  return new Raw(html);
}
function h(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    if (v instanceof Raw) out += v.html;
    else if (Array.isArray(v))
      out += v.map((x) => (x instanceof Raw ? x.html : escapeHtml(String(x)))).join("");
    else if (v !== null && v !== undefined && v !== false) out += escapeHtml(String(v));
    out += strings[i + 1] ?? "";
  });
  return out;
}

const INSURANCE_TEXT = { ENROLLED: "加入", NOT_ENROLLED: "対象外" } as const;

const KIND_SUFFIX: Record<NoticeView["employmentType"], string> = {
  FULL_TIME: "",
  PART_TIME: "／シフト制",
  NIGHT_ONLY: "／日給制",
};

function kindLine(v: NoticeView): string {
  const term = v.contract.endOn ? "・有期雇用" : "／期間の定めなし";
  return `${v.employmentTypeLabel}${term}${KIND_SUFFIX[v.employmentType]}`;
}

function typeWithTerm(v: NoticeView, long: boolean): string {
  const c = v.contract;
  if (c.convertsToIndefinite) {
    return `${v.employmentTypeLabel}${long ? `（当初${c.months}か月は有期、その後無期）` : `（${c.months}か月後に無期）`}`;
  }
  if (c.endOn) return `${v.employmentTypeLabel}（有期）`;
  return `${v.employmentTypeLabel}${long ? "（期間の定めなし）" : ""}`;
}

export function renderNoticeSheets(v: NoticeView, opt: RenderOptions): string {
  const no = opt.noticeNo ?? "（発行時に採番）";
  const badge = opt.preview ? raw('<span class="new">2024改正</span>') : raw("");
  const draft =
    opt.preview && opt.noticeNo === null ? raw('<span class="sample">下書き</span>') : raw("");
  const c = v.contract;
  const isFullTime = v.employmentType === "FULL_TIME";
  const name = v.employeeName || "　　　　";

  const period = c.endOn
    ? `${formatSlashDate(c.startOn)}〜${formatSlashDate(c.endOn)}`
    : formatSlashDate(c.startOn);
  const summary: ReadonlyArray<[string, string]> = [
    ["雇用形態", typeWithTerm(v, false)],
    [c.endOn ? "契約期間" : "入社日", period],
    ["勤務先", v.office.name],
    ["賃金", v.wage.summary],
    [
      isFullTime ? "所定労働時間" : "週所定労働時間",
      isFullTime ? `月平均 ${v.monthlyHours ?? ""}時間` : (v.weeklyHoursText.split("（")[0] ?? ""),
    ],
  ];

  const foot = (n: number) =>
    h`<div class="foot"><span>${v.company.name}　労働条件通知書（${v.employmentTypeLabel}）</span><span class="pageno">${n} / 3</span></div>`;

  // ---------- 1 枚目 ----------
  let contractRows: string;
  if (c.convertsToIndefinite && c.endOn) {
    contractRows = h`<dt>契約期間</dt><dd>期間の定めあり　${formatJpDate(c.startOn)} 〜 ${formatJpDate(c.endOn)}（${c.months}か月）</dd>
<dt>満了後の取扱い</dt><dd>期間の定めのない労働契約（無期契約）に切り替える<div class="sub">ただし、下記の事項により契約を終了する場合がある</div></dd>
<dt>判断の基準</dt><dd><div class="chips">${c.renewalCriteria.map((x) => raw(h`<span>${x}</span>`))}</div></dd>
<dt>更新上限${badge}</dt><dd>有期契約としての更新はなし（満了後は無期契約へ切替）</dd>`;
  } else if (c.endOn) {
    contractRows = h`<dt>契約期間</dt><dd>期間の定めあり　${formatJpDate(c.startOn)} 〜 ${formatJpDate(c.endOn)}（${c.months}か月）</dd>
<dt>更新の有無</dt><dd>更新する場合があり得る</dd>
<dt>更新の判断基準</dt><dd><div class="chips">${c.renewalCriteria.map((x) => raw(h`<span>${x}</span>`))}</div></dd>
<dt>更新上限${badge}</dt><dd>無</dd>`;
  } else {
    contractRows = h`<dt>契約期間</dt><dd>期間の定めなし（${formatJpDate(c.startOn)} 入社）</dd>`;
    if (c.trialPeriod) contractRows += h`<dt>試用期間</dt><dd>${c.trialPeriod}</dd>`;
  }

  const patternRows = v.patterns.map((p) =>
    raw(
      h`<tr><td>${p.label}</td><td class="num">${p.start}</td><td class="num">${p.end}</td><td class="num">${p.breakMinutes ? `${p.breakMinutes}分` : "なし"}</td><td class="num">${p.workHours}時間</td></tr>`,
    ),
  );

  const leaveNote =
    v.paidLeaveDays < 10 ? `（週${v.daysPerWeek}日勤務の比例付与）` : "（以後、法定どおり加算）";

  const p1 = h`<article class="sheet">${draft}
<div class="doc-head"><div><div class="kind">${kindLine(v)}</div><h2>労働条件通知書</h2></div><div class="meta">交付日　${formatJpDate(v.issuedOn)}<br>通知書番号　${no}</div></div>
<div class="parties"><div><div class="sub">労働者</div><div class="who">${name}<small>様</small></div></div>
<div><dl class="kv"><dt>事業者</dt><dd>${v.company.name}</dd><dt>所在地</dt><dd>${v.company.address}</dd><dt>使用者職氏名</dt><dd>${v.company.representative}</dd></dl></div></div>
<div class="summary">${summary.map(([l, val]) => raw(h`<div><span class="l">${l}</span><span class="v">${val}</span></div>`))}</div>
<section class="sec"><div><h3><span class="n">01</span>契約期間</h3></div><dl class="rows">${raw(contractRows)}</dl></section>
<section class="sec"><div><h3><span class="n">02</span>就業場所・業務</h3></div><div class="stack">
<div class="two"><div><span class="l">就業場所｜雇入れ直後</span>${v.office.name}<div class="sub">${v.office.address}</div></div><div><span class="l">就業場所｜変更の範囲${badge}</span>${v.workplaceScope}</div></div>
<div class="two"><div><span class="l">業務｜雇入れ直後</span>${v.jobDescription}</div><div><span class="l">業務｜変更の範囲${badge}</span>${v.jobScope}</div></div></div></section>
<section class="sec"><div><h3><span class="n">03</span>労働時間</h3></div><dl class="rows">
<dt>労働時間制度</dt><dd>${v.workingTimeSystem}</dd>
<dt>勤務パターン</dt><dd><table class="t"><thead><tr><th>区分</th><th>始業</th><th>終業</th><th>休憩</th><th>実働</th></tr></thead><tbody>${patternRows}</tbody></table>${isFullTime ? raw('<div class="sub" style="margin-top:3px">勤務日・勤務パターンは前月中にシフト表で通知する</div>') : ""}</dd>
${isFullTime ? raw(h`<dt>所定労働時間</dt><dd>1か月平均 ${v.monthlyHours ?? ""}時間</dd>`) : raw(h`<dt>週所定労働時間</dt><dd>${v.weeklyHoursText}</dd>`)}
<dt>所定時間外労働</dt><dd>${v.overtime}</dd>
${v.holidayWork ? raw(h`<dt>休日労働</dt><dd>${v.holidayWork}</dd>`) : ""}
</dl></section>
<section class="sec"><div><h3><span class="n">04</span>休日・休暇</h3></div><dl class="rows">
<dt>休日</dt><dd>${v.holidays}</dd>
<dt>年次有給休暇</dt><dd>6か月継続勤務・出勤率8割以上で <b>${v.paidLeaveDays}日</b> 付与${leaveNote}${v.employmentType === "NIGHT_ONLY" ? raw('<div class="sub">夜勤1回（2暦日にわたる勤務）の休暇取得は2日分として扱う</div>') : ""}</dd>
<dt>その他の休暇</dt><dd>慶弔休暇、キッズサポート休暇（小学3年生までの子の病気で年3日）、年末年始休暇<br><span class="sub">産前産後休業、育児・介護休業、子の看護等休暇、介護休暇は法令・就業規則による</span></dd>
</dl></section>${raw(foot(1))}</article>`;

  // ---------- 2 枚目 ----------
  const wageRows = v.wage.rows.map((r, i) => {
    if (i === 0 && v.wage.nightBreakdown && v.wage.nightTotalYen !== null) {
      const lines = v.wage.nightBreakdown
        .map(
          (b) =>
            h`${b.label}（実働${b.workHours}時間）：基本日給 ${formatYen(b.baseYen)}（1時間あたり ${round1(b.hourlyYen).toFixed(1)}円）＋ 深夜割増賃金 ${formatYen(b.premiumYen)}`,
        )
        .join("<br>");
      return raw(
        h`<tr><td>${r.label}</td><td><b>${formatYen(v.wage.nightTotalYen)}</b>（勤務パターンにかかわらず同額）<div class="sub">${raw(lines)}<br>深夜割増は22時〜翌5時の${v.wage.nightHours ?? ""}時間×25%</div></td></tr>`,
      );
    }
    return raw(h`<tr><td>${r.label}</td><td>${r.body}</td></tr>`);
  });
  const premiumRows = v.premiumRates.map((r) =>
    raw(
      h`<tr><td>${r.label}</td><td class="num">${r.rate === "50%" ? raw("<b>50%</b>") : r.rate}</td></tr>`,
    ),
  );

  let conversion = "";
  const ic = v.indefiniteConversion;
  if (ic?.kind === "SWITCH") {
    conversion = h`<section class="sec"><div><h3><span class="n">09</span>無期契約への切替</h3></div><div class="info"><b>${formatJpDate(ic.switchOn)}から</b>、期間の定めのない労働契約に切り替わります。<br>切替後の労働条件は、契約期間を除き本書と同じです。</div></section>`;
  } else if (ic?.kind === "RIGHT") {
    conversion = ic.eligible
      ? h`<section class="sec"><div><h3><span class="n">09</span>無期転換</h3></div><div class="info">同一の会社との有期労働契約が通算5年を超えるため（今回の契約を含め通算${ic.cumulativeMonths}か月）、<b>本契約期間中に申し込むことにより、本契約期間の末日の翌日から期間の定めのない労働契約（無期契約）に転換できます</b>（労働契約法第18条）。<br><b>転換後の労働条件：</b>契約期間を除き、本書と同じです。</div></section>`
      : h`<section class="sec"><div><h3><span class="n">09</span>無期転換</h3></div><div class="info">同一の会社との有期労働契約が通算5年を超えると、本人の申込みにより期間の定めのない労働契約（無期契約）に転換できます（労働契約法第18条）。<br><b>今回の契約での無期転換申込権：</b>発生しない</div></section>`;
  }

  const retirement = `有（${v.retirement.age}歳）`;
  const rehire =
    `有（定年後は再雇用により${v.retirement.rehireUntil}歳まで。${v.retirement.continueAfter65 ? `${v.retirement.rehireUntil}歳以降も本人の希望と会社の判断により継続可` : ""}）`.replace(
      "。）",
      "）",
    );

  const p2 = h`<article class="sheet">${draft}
<div class="cont"><span>労働条件通知書（続き）　${name} 様</span><span>通知書番号 ${no}</span></div>
<section class="sec first"><div><h3><span class="n">05</span>賃金</h3></div><div class="stack">
<table class="t"><thead><tr><th style="width:30%">項目</th><th>金額・計算方法</th></tr></thead><tbody>${wageRows}<tr><td>固定残業代</td><td>無</td></tr></tbody></table>
<table class="t"><thead><tr><th style="width:60%">割増賃金率</th><th>率</th></tr></thead><tbody>${premiumRows}${v.employmentType === "PART_TIME" ? raw('<tr><td>所定時間外・法定時間内</td><td class="num">割増なし（通常の賃金）</td></tr>') : ""}</tbody></table>
<dl class="rows"><dt>締切日・支払日</dt><dd>${v.payCutoff}締め、${v.payDay}払い</dd><dt>支払方法</dt><dd>本人名義の金融機関口座への振込</dd><dt>賃金からの控除</dt><dd>無（法定控除を除く）</dd>
<dt>昇給</dt><dd>${v.raise}</dd><dt>賞与</dt><dd>${v.bonus}</dd><dt>退職金</dt><dd>${v.retirementAllowance}</dd></dl></div></section>
<section class="sec"><div><h3><span class="n">06</span>退職</h3></div><dl class="rows">
<dt>定年</dt><dd>${retirement}</dd><dt>継続雇用制度</dt><dd>${rehire}</dd>
<dt>自己都合退職</dt><dd>退職日の1か月以上前に申し出ること</dd><dt>解雇の事由・手続</dt><dd>就業規則に定める解雇事由・手続による</dd></dl></section>
<section class="sec"><div><h3><span class="n">07</span>社会保険等</h3></div><table class="t"><thead><tr><th>健康保険</th><th>厚生年金</th><th>雇用保険</th><th>労災保険</th></tr></thead><tbody><tr><td>${INSURANCE_TEXT[v.insurance.health]}</td><td>${INSURANCE_TEXT[v.insurance.pension]}</td><td>${INSURANCE_TEXT[v.insurance.employment]}</td><td>加入</td></tr></tbody></table></section>
<section class="sec"><div><h3><span class="n">08</span>相談窓口・その他</h3></div><dl class="rows">
<dt>相談窓口</dt><dd>${v.office.name}　${v.office.managerName}<br><span class="sub">TEL ${v.office.tel}</span></dd>
<dt>副業・兼業</dt><dd>副業・兼業をする場合は、勤務先・勤務日・労働時間を会社に届け出ること。他の事業主のもとでの労働時間との通算により時間外労働となる場合は、別途割増賃金を支払う</dd>
<dt>その他</dt><dd>本書に定めのない事項は就業規則による</dd></dl></section>
${raw(conversion)}
<div class="foot"><span>本書は${v.legalBasis}に基づく労働条件の明示です。<br>労働者が希望した場合は電子メール等による交付も可能です。紛争防止のため大切に保管してください。</span><span class="pageno">2 / 3</span></div></article>`;

  // ---------- 3 枚目 (署名) ----------
  const p3 = h`<article class="sheet">${draft}
<div class="cont"><span>${v.company.name}</span><span>通知書番号 ${no}</span></div>
<div class="sig-title">雇用契約 同意書 兼 受領書</div>
<p class="sig-lead">労働条件通知書（通知書番号 ${no}・全2ページ）の内容による雇用契約について</p>
<table class="t"><tbody>
<tr><th style="width:24%">雇用形態</th><td>${typeWithTerm(v, true)}</td></tr>
<tr><th>${c.endOn ? "契約期間" : "入社日"}</th><td>${c.endOn ? `${formatJpDate(c.startOn)} 〜 ${formatJpDate(c.endOn)}` : formatJpDate(c.startOn)}</td></tr>
<tr><th>勤務先</th><td>${v.office.name}</td></tr>
<tr><th>賃金</th><td>${v.wage.summary}</td></tr>
<tr><th>労働時間</th><td>${v.patterns.map((p) => `${p.label} ${p.start}〜${p.end}`).join("／")}</td></tr>
</tbody></table>
<ul class="checks"><li><span class="box"></span><span>労働条件通知書（全2ページ）を受け取り、内容の説明を受けました。</span></li>
<li><span class="box"></span><span>上記の内容に同意し、雇用契約を締結します。</span></li>
<li><span class="box"></span><span>今後の労働条件通知書は電子メール等での交付を希望します。（任意）</span></li></ul>
<div class="sign-block"><div class="who-l">労働者</div>
<div class="line"><span>署名日</span><span>　　　　年　　月　　日</span></div>
<div class="line"><span>住所</span><span></span></div>
<div class="line"><span>氏名（自署）</span><span></span><span class="seal">印</span></div></div>
<div class="sign-block"><div class="who-l">使用者</div>
<div class="line"><span>所在地</span><span>${v.company.address}</span></div>
<div class="line"><span>法人名</span><span>${v.company.name}</span></div>
<div class="line"><span>代表者</span><span>${v.company.representative}</span><span class="seal">印</span></div></div>
<div class="cut">本書は2部作成し、労働者と会社がそれぞれ1部ずつ保管します。</div>
<div class="foot"><span>${v.company.name}　雇用契約 同意書 兼 受領書（${v.employmentTypeLabel}）</span><span class="pageno">3 / 3</span></div></article>`;

  return p1 + p2 + p3;
}

/** プロトタイプの帳票 CSS (画面用 + 印刷用) */
export const NOTICE_CSS = `
:root{--paper:#fff;--ink:#1b2130;--ink-2:#4d5668;--rule:#c9ced8;--tint:#f3f5f9;--brand:#2c4a78;--stamp:#b3261e;
--f-display:"BIZ UDPMincho","Hiragino Mincho ProN","Yu Mincho",serif;--f-body:"BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:#e9ecf1;font-family:var(--f-body);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{padding:16px}
h2,h3{margin:0}
.sheet{background:var(--paper);color:var(--ink);width:100%;max-width:794px;margin:0 auto;padding:44px 48px 40px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 8px 28px rgba(20,30,50,.10);border-radius:2px;position:relative;font-size:12.5px;line-height:1.65}
.sheet + .sheet{margin-top:24px}
.sample{position:absolute;top:16px;right:18px;font-size:10.5px;font-weight:700;color:var(--stamp);border:1px solid var(--stamp);padding:1px 8px;border-radius:3px;letter-spacing:.1em}
.doc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;border-bottom:2px solid var(--brand);padding-bottom:10px}
.doc-head .kind{font-size:10.5px;color:var(--ink-2);letter-spacing:.08em}
.doc-head h2{font-family:var(--f-display);font-size:22px;letter-spacing:.12em;font-weight:700}
.doc-head .meta{font-size:11px;color:var(--ink-2);text-align:right;font-variant-numeric:tabular-nums}
.cont{font-size:11px;color:var(--ink-2);display:flex;justify-content:space-between;border-bottom:1px solid var(--rule);padding-bottom:6px;margin-bottom:4px}
.parties{display:grid;grid-template-columns:1fr 1.25fr;gap:24px;margin-top:14px}
.parties > div{min-width:0}
.who{font-size:18px;font-weight:700;border-bottom:1px solid var(--ink);padding-bottom:2px;display:inline-block;min-width:12em}
.who small{font-size:12px;font-weight:400;margin-left:.6em}
.kv{display:grid;grid-template-columns:7.5em 1fr;gap:2px 10px;font-size:11.5px;margin:0}
.kv dt{color:var(--ink-2)} .kv dd{margin:0}
.summary{display:grid;grid-template-columns:repeat(5,1fr);margin-top:16px;border:1px solid var(--rule);border-radius:4px;overflow:hidden}
.summary > div{padding:8px 10px;border-left:1px solid var(--rule);min-width:0;background:var(--tint)}
.summary > div:first-child{border-left:0}
.summary .l{font-size:10px;color:var(--ink-2);letter-spacing:.06em;display:block}
.summary .v{font-weight:700;font-size:12.5px;line-height:1.4;display:block}
.sec{display:grid;grid-template-columns:118px 1fr;border-top:1px solid var(--rule);padding:11px 0;gap:14px;break-inside:avoid}
.sec.first{border-top:0;padding-top:6px}
.sec > div,.sec > dl{min-width:0}
.sec h3{font-size:12.5px;font-weight:700;color:var(--brand);line-height:1.45}
.sec h3 .n{display:block;font-family:var(--f-display);font-size:11px;color:var(--ink-2);font-weight:400;letter-spacing:.08em}
.rows{display:grid;grid-template-columns:9.5em 1fr;gap:5px 12px;margin:0}
.rows > dt{color:var(--ink-2);font-size:11.5px}
.rows > dd{margin:0;min-width:0}
.stack{display:grid;gap:8px;min-width:0}
.sub{font-size:11px;color:var(--ink-2)}
.chips{display:flex;flex-wrap:wrap;gap:4px 6px}
.chips span{font-size:11px;border:1px solid var(--rule);border-radius:3px;padding:0 6px}
.new{font-size:9.5px;font-weight:700;color:var(--paper);background:var(--brand);border-radius:2px;padding:0 4px;margin-left:6px;vertical-align:1px;letter-spacing:.04em}
table.t{width:100%;border-collapse:collapse;font-size:11.5px}
table.t th,table.t td{border:1px solid var(--rule);padding:4px 8px;text-align:left;vertical-align:top}
table.t th{background:var(--tint);font-weight:700;color:var(--ink-2);font-size:10.5px}
table.t td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--rule);border-radius:3px}
.two > div{padding:6px 10px;min-width:0}
.two > div + div{border-left:1px solid var(--rule)}
.two .l{display:block;font-size:10px;color:var(--ink-2);letter-spacing:.06em}
.info{background:var(--tint);border-radius:4px;padding:10px 12px;font-size:11px;color:var(--ink-2);line-height:1.7}
.info b{color:var(--ink)}
.foot{margin-top:14px;font-size:10px;color:var(--ink-2);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pageno{font-variant-numeric:tabular-nums}
.sig-title{font-family:var(--f-display);font-size:20px;letter-spacing:.1em;text-align:center;margin:18px 0 4px;font-weight:700}
.sig-lead{text-align:center;font-size:11.5px;color:var(--ink-2);margin:0 0 16px}
.checks{list-style:none;padding:0;margin:16px 0;display:grid;gap:8px}
.checks li{display:flex;gap:10px;align-items:flex-start}
.box{width:14px;height:14px;border:1.5px solid var(--ink);border-radius:2px;flex:none;margin-top:3px}
.sign-block{border:1.5px solid var(--ink);border-radius:4px;padding:14px 18px;margin-top:14px;break-inside:avoid}
.sign-block .who-l{font-size:11px;color:var(--ink-2);letter-spacing:.08em}
.line{display:flex;gap:10px;align-items:flex-end;border-bottom:1px solid var(--ink-2);padding:16px 0 3px;font-size:12px}
.line span:first-child{color:var(--ink-2);width:5.5em;flex:none}
.line .seal{margin-left:auto;color:var(--ink-2)}
.cut{margin-top:26px;border-top:1px dashed var(--rule);padding-top:10px;font-size:10.5px;color:var(--ink-2)}
@media (max-width:640px){
  .wrap{padding:8px}
  .sheet{padding:28px 18px}
  .parties,.two{grid-template-columns:1fr}
  .two > div + div{border-left:0;border-top:1px solid var(--rule)}
  .summary{grid-template-columns:1fr 1fr}
  .summary > div{border-left:0;border-top:1px solid var(--rule)}
  .sec{grid-template-columns:1fr;gap:6px}
  .rows{grid-template-columns:1fr;gap:0}
  .rows > dd{margin-bottom:6px}
}
@media print{
  @page{size:A4;margin:12mm 13mm}
  body{background:#fff}
  .wrap{padding:0}
  .sheet{box-shadow:none;max-width:none;width:auto;padding:7mm 0 0;margin:0!important;border-radius:0;break-before:page;font-size:9pt;line-height:1.45}
  .sheet:first-child{break-before:auto}
  .sample{top:0;right:0}
  .sec{padding:5px 0;gap:10px}
  .rows{gap:2px 10px}
  .rows > dt,.kv{font-size:8.5pt}
  .sub{font-size:8pt}
  .summary{margin-top:10px}
  .summary > div{padding:5px 8px}
  table.t{font-size:8.5pt}
  table.t th,table.t td{padding:2px 6px}
  table.t th{font-size:8pt}
  .stack{gap:6px}
  .two > div{padding:4px 8px}
  .info{padding:7px 10px;font-size:8.5pt;line-height:1.55}
  .doc-head h2{font-size:16pt}
  .parties{margin-top:10px}
  .foot{margin-top:8px;font-size:7.5pt}
  .sig-title{font-size:17pt}
  .line{font-size:9.5pt}
}`;

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=BIZ+UDPMincho:wght@400;700&display=swap">';

/** iframe / PDF 用の完全な HTML 文書 */
export function renderNoticeDocument(v: NoticeView, opt: RenderOptions): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>労働条件通知書</title>${FONT_LINK}<style>${NOTICE_CSS}</style></head><body><div class="wrap">${renderNoticeSheets(v, opt)}</div></body></html>`;
}
