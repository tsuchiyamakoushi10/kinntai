/**
 * 労働条件通知書 / 雇用契約書 の HTML テンプレート (文字列ビルダー)。
 *
 * Next.js 15 はサーバ側でも `react-dom/server` 直接 import を嫌うため、
 * React JSX ではなくテンプレ文字列で HTML を組み立てる。
 *
 * 株式会社クロスハートのサンプル書式に倣う:
 *   - 上部: 発行日、対象者氏名、事業場
 *   - 表形式: 契約期間 / 就業場所 / 業務内容 / 始終業 / 休日休暇 / 賃金 / 退職 / その他
 *   - 末尾: 法令準拠の注記、署名欄
 */
import type { ContractViewModel } from "./data";
import { formatReiwa } from "./data";

const WEEKLY_HOURS_LABEL: Record<ContractViewModel["contract"]["weeklyHoursCategory"], string> = {
  UNDER_20: "20時間未満 (パート)",
  BETWEEN_20_30: "20時間以上〜30時間未満 (雇用保険加入)",
  BETWEEN_30_40: "30時間以上〜40時間以下 (社会保険・雇用保険加入)",
};

const SPECIAL_MEASURE_LABEL: Record<ContractViewModel["contract"]["specialMeasureType"], string> = {
  NONE: "",
  HIGH_SKILL: "Ⅰ 高度専門",
  POST_RETIREMENT: "Ⅱ 定年後の高齢者",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** テンプレリテラルでエスケープを強制するためのタグ関数。 */
function h(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    out += v === null || v === undefined ? "" : escapeHtml(String(v));
    out += strings[i + 1] ?? "";
  }
  return out;
}

/** 既にエスケープ済の HTML フラグメントを差し込む際に使う印 (raw)。 */
function raw(s: string): string {
  return s;
}

function row(label: string, body: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${body}</td></tr>`;
}

/** 1 契約分の HTML 文書全体を組み立てる。 */
export function renderContractHtml(vm: ContractViewModel): string {
  const c = vm.contract;
  const co = vm.company;

  // 賃金 / 期間が未入力の契約は本来 validation で弾く前提。万一通った場合のフォールバック表示。
  const wageAmount = c.wageAmount?.toLocaleString() ?? "（未入力）";
  const wageRow = c.wageType === "MONTHLY" ? h`月給 ${wageAmount} 円` : h`時給 ${wageAmount} 円`;

  const startText = c.contractStartOn ? formatReiwa(c.contractStartOn) : "（未入力）";
  const periodText = c.contractEndOn
    ? h`期間の定めあり（${startText} から ${formatReiwa(c.contractEndOn)}）`
    : h`期間の定めなし（${startText} から）`;

  const rows: string[] = [];
  rows.push(row("契約期間", periodText));

  if (c.contractEndOn) {
    const renewBody =
      h`${c.isRenewable ? "更新する場合があり得る" : "契約の更新はしない"}` +
      (c.hasRenewalLimit && c.renewalLimitCount !== null
        ? h`　／更新上限 ${c.renewalLimitCount} 回`
        : "") +
      (c.renewalCriteria ? h`<div>更新の判断基準: ${c.renewalCriteria}</div>` : "");
    rows.push(row("契約の更新", renewBody));
  }

  if (c.specialMeasureType !== "NONE") {
    let body = h`${SPECIAL_MEASURE_LABEL[c.specialMeasureType]}`;
    if (c.specialMeasureType === "HIGH_SKILL" && c.specialMeasureBusinessTitle) {
      body += h`<div>特定有期業務: ${c.specialMeasureBusinessTitle}</div>`;
      if (c.specialMeasureStartOn) {
        body += h`<div>開始: ${formatReiwa(c.specialMeasureStartOn)}</div>`;
      }
      if (c.specialMeasureEndOn) {
        body += h`<div>完了: ${formatReiwa(c.specialMeasureEndOn)}</div>`;
      }
    }
    rows.push(row("有期雇用特別措置法の特例", body));
  }

  rows.push(
    row("就業の場所", h`（雇入直後）${c.workplaceInitial}<br>（変更の範囲）${c.workplaceScope}`),
  );
  rows.push(
    row(
      "従事すべき業務の内容",
      h`（雇入直後）${c.jobDescriptionInitial}<br>（変更の範囲）${c.jobDescriptionScope}`,
    ),
  );

  const scheduleBody =
    (c.shiftBasedSchedule
      ? "1. 勤務日・始業・終業の時刻等<br>　勤務日: シフトにおいて休日とされた日以外とする<br>　始業及び終業の時刻は、シフトにおいて定める" +
        (c.hasEarlyEndPossibility ? "<br>　※終業時刻の繰り上げの可能性あり" : "")
      : "1. 固定勤務 (シフトに準じる)") +
    h`<br>2. 休憩時間: ${co.breakRuleText}` +
    h`<br>3. 所定時間外労働の有無: ${c.hasOvertime ? "有" : "無"}` +
    h`<br>4. 週所定労働時間: ${WEEKLY_HOURS_LABEL[c.weeklyHoursCategory]}` +
    h`<br>　（1 日 ${c.workingHoursPerDay} 時間、週 ${c.workingDaysPerWeek} 日）`;
  rows.push(row("始業、終業の時刻、休憩時間、所定時間外労働の有無", scheduleBody));

  rows.push(row("休日", "勤務日以外の日とする"));
  rows.push(
    row("休暇", "1. 年次有給休暇: 法定通り付与する<br>2. その他の休暇: 法定の休暇、慶弔休暇"),
  );

  const allowancesHtml =
    c.allowances.length > 0
      ? '2. 諸手当の額又は計算方法<ol class="allowances">' +
        c.allowances
          .map(
            (a) =>
              `<li>${escapeHtml(a.name)} ${escapeHtml(a.amountYen.toLocaleString())} 円` +
              (a.calculationMethod ? `　／計算方法: ${escapeHtml(a.calculationMethod)}` : "") +
              "</li>",
          )
          .join("") +
        "</ol>"
      : "";
  const wageBody =
    h`1. 基本賃金: ${wageRow}<br>` +
    raw(allowancesHtml) +
    h`3. 所定時間外、休日又は深夜労働に対して支払われる割増賃金率<br>　所定時間外 法定超 月60時間以内 ${co.overtimeRateUnder60h}%、月60時間超 ${co.overtimeRateOver60h}%<br>　所定超 ${co.overtimeRateWithin}%　／法定休日 ${co.holidayLegalRate}%　／深夜 ${co.nightRate}%<br>4. 賃金締切日: ${co.wageCutoffDay}　5. 賃金支払日: ${co.wagePaymentDay}<br>6. 賃金の支払方法: ${co.wagePaymentMethod}<br>7. 昇給: ${co.salaryRaisePeriod}<br>` +
    (c.hasBonus ? h`8. 賞与: 有（${c.bonusDescription ?? ""}）` : "8. 賞与: 無") +
    "<br>" +
    (c.retirementAllowanceStartText
      ? h`9. 退職金: 有（${c.retirementAllowanceStartText}）`
      : "9. 退職金: 無");
  rows.push(row("賃金", wageBody));

  rows.push(
    row(
      "退職に関する事項",
      h`1. 定年制 (${co.retirementAge} 歳)<br>2. 継続雇用制度 (${co.continuedEmploymentAge} 歳まで)<br>3. 自己都合退職の手続: 退職する ${co.resignNoticeDays} 日以上前に願い出るようにすること<br>4. 解雇の事由及び手続: ${co.workRulesName} 記載のとおり`,
    ),
  );

  rows.push(
    row(
      "その他",
      h`社会保険の加入: ${c.hasSocialInsurance ? "厚生年金・健康保険 加入" : "加入なし"}<br>雇用保険の適用: ${c.hasEmploymentInsurance ? "有" : "無"}<br>相談窓口: ${co.contactDepartment}　${co.contactPersonTitle} ${co.contactPersonName}　TEL ${co.contactPhone}<br>適用される就業規則: ${co.workRulesName} / ${co.partTimeWorkRulesName}`,
    ),
  );

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(vm.documentTitle)} - ${escapeHtml(vm.employee.fullName)}</title>
    <style>${CSS}</style>
  </head>
  <body>
    <h1 class="title">${escapeHtml(vm.documentTitle)}</h1>
    <p class="issued-on">${escapeHtml(vm.issuedOn)}</p>
    <p class="recipient">${escapeHtml(vm.employee.fullName)} 殿</p>
    <p class="sender">
      事業場名称・所在地　${escapeHtml(co.legalName)}　${escapeHtml(co.address)}<br>
      使用者職氏名　　　　${escapeHtml(co.representativeTitle)}　${escapeHtml(co.representativeName)}
    </p>
    <table class="terms"><tbody>${rows.join("")}</tbody></table>
    <p class="footnote">
      ※ 以上のほかは、当社就業規則による。<br>
      ※ 本通知書の交付は、労働基準法第15条に基づく労働条件の明示及び短時間労働者の雇用管理の改善等に関する法律第6条に基づく文書の交付を兼ねるものであること。<br>
      ※ 労働条件通知書については、労使間の紛争の未然防止のため、保存しておくことをお勧めします。
    </p>
    <section class="signature">
      <p>上記内容について説明を受け、同意し、雇用契約を締結します。</p>
      <p class="signature-date">${escapeHtml(vm.issuedOn)}</p>
      <p>
        所在地　${escapeHtml(co.address)}<br>
        法人名　${escapeHtml(co.legalName)}<br>
        代表者　${escapeHtml(co.representativeTitle)}　${escapeHtml(co.representativeName)}
      </p>
      <table class="signee"><tbody>
        <tr><th>住所</th><td>　</td></tr>
        <tr><th>電話番号</th><td>　</td></tr>
        <tr><th>氏名</th><td>${escapeHtml(vm.employee.fullName)}</td></tr>
      </tbody></table>
    </section>
  </body>
</html>`;
}

const CSS = `
@page { size: A4; margin: 16mm 14mm; }
html, body {
  font-family: "IPAGothic", "WenQuanYi Zen Hei", "Noto Sans CJK JP", sans-serif;
  font-size: 9.5pt;
  line-height: 1.5;
  color: #1f2937;
}
.title { font-size: 14pt; text-align: center; margin: 0 0 8pt; font-weight: bold; }
.issued-on { text-align: right; margin: 0; font-size: 9pt; }
.recipient { margin: 8pt 0 4pt; font-weight: bold; }
.sender { margin: 0 0 10pt; font-size: 9pt; line-height: 1.6; }
table.terms { width: 100%; border-collapse: collapse; }
table.terms th, table.terms td { border: 1px solid #475569; padding: 4pt 6pt; vertical-align: top; font-size: 9pt; }
table.terms th { width: 22%; background: #f1f5f9; font-weight: bold; text-align: left; }
ol.allowances { margin: 2pt 0 4pt 18pt; padding: 0; }
.footnote { font-size: 8pt; color: #475569; margin: 10pt 0; line-height: 1.6; }
.signature { margin-top: 16pt; }
.signature p { margin: 4pt 0; }
.signature-date { text-align: right; }
table.signee { width: 100%; border-collapse: collapse; margin-top: 8pt; }
table.signee th, table.signee td { border-bottom: 1px solid #475569; padding: 6pt; }
table.signee th { width: 18%; text-align: left; font-weight: normal; }
`;
