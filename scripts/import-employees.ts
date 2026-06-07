/**
 * 社員マスター CSV を kinntai DB に取り込むスクリプト。
 *
 * 入力: /workspaces/kinntai/社員マスター_シフト用.csv (BOM 付き UTF-8)
 *   - 旧 統合社員マスター_UTF8.csv / 社員マスター_取り込み用.csv は廃止し、本ファイルに一本化
 *     (docs/employee-master.md §7)。
 *
 * 実行モード:
 *   pnpm tsx scripts/import-employees.ts dry      ... DB に書かず変換結果のみ出力
 *   pnpm tsx scripts/import-employees.ts compare  ... DB を読み取り専用で照合 (更新/新規/DB のみ を分類)
 *   pnpm tsx scripts/import-employees.ts apply    ... 実際に DB に投入 (社員コードで upsert・冪等)
 *
 * 取り込み方針:
 *   - 既存レコードは employee_code で突合して更新 (ログイン User / 雇用契約 / 既存シフトは壊さない)。
 *   - シフト専用列 (勤務区分補足 / 兼務先 / 夜勤可否 / 夜勤月上限 / 夜勤専従 / 固定勤務パターン) は
 *     スキーマ未対応のため今回は取り込まない。dry-run レポートに参考掲載のみ
 *     (将来 docs/employee-master.md §5 のスキーマ拡張後に対応)。
 *
 * 出力 (dry-run): /tmp/dry-run-result.md (人間レビュー用) + stdout サマリ
 */

import fs from "node:fs";

// ============================================================================
// 1. CSV パース (依存追加せず手書き)
// ============================================================================

type RawRow = {
  社員コード: string;
  氏名: string;
  拠点コード: string;
  "職種(推定)": string;
  雇用形態: string;
  勤務区分補足: string;
  兼務先: string;
  夜勤可否: string;
  夜勤月上限: string;
  夜勤専従: string;
  固定勤務パターン: string;
  資格: string;
  姓: string;
  名: string;
  姓カナ: string;
  名カナ: string;
  生年月日: string;
  性別: string;
  入社日: string;
  雇い入れ日: string;
  賃金区分: string;
  賃金額: string;
  週所定労働日数: string;
  "1日所定労働時間": string;
  雇用保険: string;
  社保加入: string;
  退職金対象: string;
  履歴書: string;
  契約書: string;
  個人情報保護: string;
  資格証: string;
  電話: string;
  住所: string;
  メール: string;
  備考: string;
};

const CSV_PATH = "/workspaces/kinntai/社員マスター_シフト用.csv";

function parseCsv(text: string): RawRow[] {
  // BOM 除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // 先頭に BOM のみの空行があるため、空行を除いた最初の行をヘッダとして扱う。
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cells[i] ?? "").trim();
    });
    return row as unknown as RawRow;
  });
}

function splitCsvLine(line: string): string[] {
  // 簡易 CSV: 値内にカンマや改行を含まない前提 (本 CSV を確認済み)
  return line.split(",");
}

// ============================================================================
// 2. 変換ロジック
// ============================================================================

type EmploymentType = "FULL_TIME" | "CONTRACT" | "PART_TIME";
type JobCategory =
  | "CARE_WORKER"
  | "NURSE"
  | "LIFE_COUNSELOR"
  | "CARE_MANAGER"
  | "OFFICE_STAFF"
  | "OTHER";
type QualificationType =
  | "CARE_WORKER"
  | "INITIAL_TRAINING"
  | "PRACTICAL_TRAINING"
  | "CHIEF_CARE_WORKER"
  | "NURSE"
  | "OTHER";
type DocumentType =
  | "RESUME"
  | "QUALIFICATION_CERT"
  | "PRIVACY_CONSENT"
  | "EMPLOYMENT_CONTRACT"
  | "LABOR_CONDITIONS_NOTICE"
  | "TRAINING_CERT"
  | "OTHER";

/** CSV 拠点コード → DB office.code。 */
const OFFICE_CODE_BY_CSV: Record<string, string> = {
  NH: "NRS-CENTER",
  SHORT: "SHO-CENTER",
  DEY: "DAY-CENTER",
  RIKA: "DAY-RIKKA",
  KITCHEN: "KITCHEN",
  // CARE_PLAN (居宅介護支援) は DB 拠点未登録。docs/employee-master.md §2 TODO。
};

function mapEmploymentType(v: string): { value: EmploymentType | null; note?: string } {
  const s = v.trim().toUpperCase();
  if (s === "FULL_TIME") return { value: "FULL_TIME" };
  if (s === "PART_TIME") return { value: "PART_TIME" };
  if (s === "CONTRACT") return { value: "CONTRACT" };
  if (s === "") return { value: null };
  return { value: null, note: `未対応の雇用形態値: ${v}` };
}

/** 職種(推定) 列 → DB JobCategory。 */
function mapJobCategory(v: string): { value: JobCategory | null; note?: string } {
  const s = v.trim().toUpperCase();
  if (s === "CAREGIVER" || s === "CARE_WORKER") return { value: "CARE_WORKER" };
  if (s === "NURSE") return { value: "NURSE" };
  if (s === "CARE_MANAGER") return { value: "CARE_MANAGER" };
  if (s === "COUNSELOR" || s === "LIFE_COUNSELOR") return { value: "LIFE_COUNSELOR" };
  if (s === "OFFICE_STAFF") return { value: "OFFICE_STAFF" };
  if (s === "OTHER") return { value: "OTHER" };
  if (s === "") return { value: null };
  return { value: "OTHER", note: `未対応の職種値: ${v} → OTHER` };
}

/** 資格 文字列 → qualificationType (job 推定は職種列を優先するので qual のみ使う)。 */
function mapQualification(v: string): {
  qual: QualificationType | null;
  raw: string;
  note?: string;
} {
  const s = v.trim();
  if (!s || s === "ー" || s === "-") return { qual: null, raw: s };
  if (s === "介護福祉士") return { qual: "CARE_WORKER", raw: s };
  if (s === "初任者研修") return { qual: "INITIAL_TRAINING", raw: s };
  if (s === "基礎研修")
    return {
      qual: "INITIAL_TRAINING",
      raw: s,
      note: "基礎研修 → INITIAL_TRAINING に丸めた",
    };
  if (s === "実務者" || s === "実務者研修") return { qual: "PRACTICAL_TRAINING", raw: s };
  if (s === "看護師" || s === "准看護師") return { qual: "NURSE", raw: s };
  if (s === "主任ケアマネ" || s === "ケアマネ") return { qual: "OTHER", raw: s };
  if (s === "主事" || s === "柔整師" || s === "調理師") return { qual: "OTHER", raw: s };
  return { qual: null, raw: s, note: `未対応の資格: ${s}` };
}

/** TRUE/FALSE (新 CSV) と 〇× (旧表記) の両対応 bool パーサ。 */
function parseBool(v: string): { value: boolean | null; raw: string; note?: string } {
  const s = v.trim();
  if (!s) return { value: null, raw: s };
  const u = s.toUpperCase();
  if (u === "TRUE" || s === "〇" || s === "○" || s === "◯") return { value: true, raw: s };
  if (u === "FALSE" || s === "×") return { value: false, raw: s };
  return { value: null, raw: s, note: `bool 化できない値: ${s}` };
}

function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function splitName(
  full: string,
  lastCol: string,
  firstCol: string,
): { last: string; first: string; split: boolean } {
  // 姓・名 列があればそれを優先。
  if (lastCol.trim() || firstCol.trim()) {
    return { last: lastCol.trim(), first: firstCol.trim(), split: !!firstCol.trim() };
  }
  const s = full.trim();
  if (!s) return { last: "", first: "", split: false };
  const m = s.match(/^(\S+)[\s　]+(\S+)$/);
  if (m) return { last: m[1] ?? "", first: m[2] ?? "", split: true };
  // 機械分割せず、全部 lastName に入れる。
  return { last: s, first: "", split: false };
}

function paddedEmployeeCode(n: number): string {
  return `E${String(n).padStart(4, "0")}`;
}

function makeImportedEmployeeCode(name: string, hiredAt: string | null): string {
  // 社員コードなしの行用。同じ氏名 + 雇い入れ日からは同じコードが出るように。
  const seed = `${name}|${hiredAt ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `IMP-${hex}`;
}

// ============================================================================
// 3. 変換実行
// ============================================================================

type DocumentPlan = { documentType: DocumentType; title: string; note?: string };
type QualificationPlan = { qualificationType: QualificationType; note: string; raw: string };

type EmployeePlan = {
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string | null;
  officeCode: string | null;
  jobCategory: JobCategory | null;
  employmentType: EmploymentType | null;
  joinedAt: string | null;
  hiredAt: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  notes: string | null;
};

type ContractPlan = {
  contractStartOn: string | null;
  employmentType: EmploymentType | null;
  hasEmploymentInsurance: boolean | null;
  hasSocialInsurance: boolean | null;
  retirementAllowanceEligible: boolean | null;
};

/** シフト専用列 (今回未取込・参考掲載用)。 */
type ShiftInfo = {
  kinmuHosoku: string;
  kenmuSaki: string;
  nightAllowed: string;
  nightMax: string;
  nightDedicated: string;
  fixedPattern: string;
};

type RowResult =
  | {
      kind: "ok";
      idx: number;
      raw: RawRow;
      employee: EmployeePlan;
      contract: ContractPlan;
      qualifications: QualificationPlan[];
      documents: DocumentPlan[];
      shift: ShiftInfo;
      review: string[];
      createUser: boolean;
      duplicateKey: string;
    }
  | { kind: "error"; idx: number; raw: RawRow; reason: string };

function transformRow(row: RawRow, idx: number): RowResult {
  if (!row.氏名.trim()) {
    return { kind: "error", idx, raw: row, reason: "氏名が空欄" };
  }

  const review: string[] = [];

  const name = splitName(row.氏名, row.姓, row.名);
  if (!name.split) review.push("氏名を姓・名に分割できなかった (firstName 空)");

  // 社員コード → employeeCode
  const numStr = row.社員コード.trim();
  let employeeCode: string;
  if (numStr) {
    const n = Math.floor(Number(numStr));
    if (Number.isFinite(n) && n > 0) {
      employeeCode = paddedEmployeeCode(n);
    } else {
      return { kind: "error", idx, raw: row, reason: `社員コードが不正: ${numStr}` };
    }
  } else {
    employeeCode = makeImportedEmployeeCode(row.氏名.trim(), parseDateLoose(row.雇い入れ日));
    review.push(`社員コードなし → ${employeeCode} を採番`);
  }

  const birthDate = parseDateLoose(row.生年月日);
  if (!birthDate) review.push("生年月日 空欄");

  const officeCode = OFFICE_CODE_BY_CSV[row.拠点コード.trim()] ?? null;
  if (!officeCode) {
    if (!row.拠点コード.trim()) review.push("拠点コード 空欄");
    else review.push(`拠点コード 未対応 (${row.拠点コード.trim()})`);
  }

  const job = mapJobCategory(row["職種(推定)"]);
  if (!job.value) review.push(`職種 未設定 (職種(推定)=${row["職種(推定)"] || "空欄"})`);
  if (job.note) review.push(job.note);

  const emp = mapEmploymentType(row.雇用形態);
  if (!emp.value) review.push(`雇用形態 不明 (${row.雇用形態 || "空欄"})`);
  if (emp.note) review.push(emp.note);

  const joinedAt = parseDateLoose(row.入社日);
  const hiredAt = parseDateLoose(row.雇い入れ日);
  if (!hiredAt) review.push("雇い入れ日 空欄");

  const notesParts: string[] = [];
  if (row.備考.trim()) notesParts.push(row.備考.trim());

  // ---- 退職金 ----
  const retBool = parseBool(row.退職金対象);

  // ---- 雇用契約 ----
  const contract: ContractPlan = {
    contractStartOn: hiredAt,
    employmentType: emp.value,
    hasEmploymentInsurance: parseBool(row.雇用保険).value,
    hasSocialInsurance: parseBool(row.社保加入).value,
    retirementAllowanceEligible: retBool.value,
  };

  // ---- qualifications ----
  const qmap = mapQualification(row.資格);
  const qualifications: QualificationPlan[] = [];
  if (qmap.qual) {
    qualifications.push({ qualificationType: qmap.qual, raw: qmap.raw, note: qmap.note ?? "" });
  }
  if (qmap.note) review.push(qmap.note);

  // ---- documents (フラグのみ) ----
  const documents: DocumentPlan[] = [];
  const docMap: { col: string; type: DocumentType; title: string }[] = [
    { col: row.履歴書, type: "RESUME", title: "履歴書" },
    { col: row.契約書, type: "EMPLOYMENT_CONTRACT", title: "雇用契約書" },
    { col: row.資格証, type: "QUALIFICATION_CERT", title: "資格証" },
    { col: row.個人情報保護, type: "PRIVACY_CONSENT", title: "個人情報保護同意書" },
  ];
  for (const d of docMap) {
    if (parseBool(d.col).value === true) {
      documents.push({
        documentType: d.type,
        title: d.title,
        note: "あり フラグのみ (実ファイル無し)",
      });
    }
  }

  // ---- User ----
  const email = row.メール.trim() || null;
  const createUser = !!email;
  if (!createUser) review.push("メール空欄 → User 自動作成スキップ");

  // ---- シフト専用列 (今回未取込) ----
  const shift: ShiftInfo = {
    kinmuHosoku: row.勤務区分補足.trim(),
    kenmuSaki: row.兼務先.trim(),
    nightAllowed: row.夜勤可否.trim(),
    nightMax: row.夜勤月上限.trim(),
    nightDedicated: row.夜勤専従.trim(),
    fixedPattern: row.固定勤務パターン.trim(),
  };

  const employee: EmployeePlan = {
    employeeCode,
    lastName: name.last,
    firstName: name.first,
    lastNameKana: row.姓カナ.trim(),
    firstNameKana: row.名カナ.trim(),
    birthDate,
    officeCode,
    jobCategory: job.value,
    employmentType: emp.value,
    joinedAt,
    hiredAt,
    phone: row.電話.trim() || null,
    address: row.住所.trim() || null,
    email,
    notes: notesParts.length > 0 ? notesParts.join(" / ") : null,
  };

  const duplicateKey = numStr
    ? `code:${employeeCode}`
    : `imp:${row.氏名.trim()}|${hiredAt ?? "no-hd"}`;

  return {
    kind: "ok",
    idx,
    raw: row,
    employee,
    contract,
    qualifications,
    documents,
    shift,
    review,
    createUser,
    duplicateKey,
  };
}

// ============================================================================
// 4. Markdown 出力
// ============================================================================

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "_(空欄)_";
  if (v === true) return "true";
  if (v === false) return "false";
  return String(v);
}

function renderMarkdown(results: RowResult[]): string {
  const oks = results.filter((r): r is Extract<RowResult, { kind: "ok" }> => r.kind === "ok");
  const errs = results.filter(
    (r): r is Extract<RowResult, { kind: "error" }> => r.kind === "error",
  );

  const lines: string[] = [];
  lines.push("# 社員マスター取り込み dry-run 結果");
  lines.push("");
  lines.push(`- 入力: ${CSV_PATH}`);
  lines.push(`- 取り込み候補: ${oks.length} / エラー: ${errs.length}`);
  lines.push("");
  lines.push("> apply 時は employee_code で突合して更新 (User / 雇用契約 / 既存シフトは保持)。");
  lines.push(
    "> シフト専用列 (兼務先 / 夜勤 / 固定勤務パターン 等) は今回未取込 (スキーマ拡張後)。",
  );
  lines.push("");

  // 拠点別サマリ
  const byOffice = new Map<string, number>();
  for (const r of oks) {
    const k = r.employee.officeCode ?? `未対応(${r.raw.拠点コード || "空"})`;
    byOffice.set(k, (byOffice.get(k) ?? 0) + 1);
  }
  lines.push("## 拠点別 人数");
  lines.push("");
  lines.push("| 拠点 (DB code) | 人数 |");
  lines.push("|---|---|");
  for (const [k, v] of [...byOffice.entries()].sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("");

  // エラー
  lines.push("## ❌ エラー行 (DB に投入しない)");
  lines.push("");
  if (errs.length === 0) lines.push("なし");
  else {
    lines.push("| # | 理由 |");
    lines.push("|---|---|");
    for (const e of errs) lines.push(`| row${e.idx + 2} | ${e.reason} |`);
  }
  lines.push("");

  // 全件空のカラム (参考)
  lines.push("## ⚠ 現 CSV で値が拾えない主なカラム");
  lines.push("");
  lines.push(
    "- employees: `lastNameKana` / `firstNameKana` (姓カナ/名カナ 空) ・ `gender` (性別 空)",
  );
  lines.push(
    "- employees: `weeklyWorkDays` / `dailyWorkHours` / `baseWageType` / `baseWageAmount` (賃金/労働時間 全件空)",
  );
  lines.push(
    "- employment_contracts: `wage*` / `workingHoursPerDay` / `workingDaysPerWeek` (同上)",
  );
  lines.push("- qualifications: `acquiredOn` (取得日不明)");
  lines.push("- → スキーマは nullable 化済み (案A) のため投入可。値は後日 UI で補完。");
  lines.push("");

  // 行ごとプレビュー
  lines.push("## 📋 行ごとの変換プレビュー");
  lines.push("");
  for (const r of oks) {
    const e = r.employee;
    lines.push(`### ${e.lastName}${e.firstName ? " " + e.firstName : ""} (${e.employeeCode})`);
    lines.push("");
    lines.push("| 項目 | 値 |");
    lines.push("|---|---|");
    lines.push(`| officeCode | ${fmtVal(e.officeCode)} (CSV: ${fmtVal(r.raw.拠点コード)}) |`);
    lines.push(`| jobCategory | ${fmtVal(e.jobCategory)} |`);
    lines.push(`| employmentType | ${fmtVal(e.employmentType)} |`);
    lines.push(`| birthDate | ${fmtVal(e.birthDate)} |`);
    lines.push(`| joinedAt / hiredAt | ${fmtVal(e.joinedAt)} / ${fmtVal(e.hiredAt)} |`);
    lines.push(`| phone / address | ${fmtVal(e.phone)} / ${fmtVal(e.address)} |`);
    lines.push(
      `| email (→ User) | ${fmtVal(e.email)}${r.createUser ? " *(User)*" : " *(skip)*"} |`,
    );
    lines.push(
      `| 雇用保険 / 社保 / 退職金 | ${fmtVal(r.contract.hasEmploymentInsurance)} / ${fmtVal(r.contract.hasSocialInsurance)} / ${fmtVal(r.contract.retirementAllowanceEligible)} |`,
    );
    lines.push(`| notes | ${fmtVal(e.notes)} |`);
    if (r.qualifications.length > 0) {
      lines.push(
        `| qualifications | ${r.qualifications.map((q) => `${q.qualificationType}(${q.raw})`).join(", ")} |`,
      );
    }
    if (r.documents.length > 0) {
      lines.push(`| documents (フラグ) | ${r.documents.map((d) => d.title).join(", ")} |`);
    }
    // シフト専用列 (未取込)
    const sh = r.shift;
    const shParts = [
      sh.kinmuHosoku ? `補足:${sh.kinmuHosoku}` : "",
      sh.kenmuSaki ? `兼務:${sh.kenmuSaki}` : "",
      sh.nightAllowed ? `夜勤:${sh.nightAllowed}` : "",
      sh.nightDedicated ? `夜専:${sh.nightDedicated}` : "",
      sh.fixedPattern ? `固定:${sh.fixedPattern}` : "",
    ].filter(Boolean);
    if (shParts.length > 0) {
      lines.push(`| 🕒 シフト列(未取込) | ${shParts.join(" / ")} |`);
    }
    if (r.review.length > 0) {
      lines.push(`| 要確認 | ${r.review.join(" / ")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// 5. main
// ============================================================================

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "dry";
  if (mode !== "dry" && mode !== "compare" && mode !== "apply") {
    console.error("Usage: pnpm tsx scripts/import-employees.ts [dry|compare|apply]");
    process.exit(2);
  }

  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(csv);
  console.error(`parsed ${rows.length} rows from ${CSV_PATH}`);

  const results = rows.map((row, idx) => transformRow(row, idx));

  // 冪等キーの衝突チェック
  const keyToIdx = new Map<string, number[]>();
  for (const r of results) {
    if (r.kind !== "ok") continue;
    const arr = keyToIdx.get(r.duplicateKey) ?? [];
    arr.push(r.idx);
    keyToIdx.set(r.duplicateKey, arr);
  }
  const collisions = [...keyToIdx.entries()].filter(([, v]) => v.length > 1);
  if (collisions.length > 0) {
    console.error("\n!! 冪等キー衝突あり (要確認):");
    for (const [k, v] of collisions) {
      console.error(`   ${k} : rows ${v.map((i) => i + 2).join(", ")}`);
    }
  }

  if (mode === "dry") {
    const md = renderMarkdown(results);
    const out = "/tmp/dry-run-result.md";
    fs.writeFileSync(out, md);
    const oks = results.filter((r) => r.kind === "ok").length;
    const errs = results.filter((r) => r.kind === "error").length;
    console.error(`\n✅ dry-run 完了  出力: ${out}`);
    console.error(
      `   取り込み候補 ${oks} 件 / エラー ${errs} 件 / キー衝突 ${collisions.length} 件`,
    );
    console.error("   ※ DB には一切書き込んでいません。");
    return;
  }

  if (mode === "compare") {
    await compareToDb(results);
    return;
  }

  await applyToDb(results);
}

// ============================================================================
// 5b. compare (DB 読み取り専用照合)
// ============================================================================

async function compareToDb(results: RowResult[]): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const oks = results.filter((r): r is Extract<RowResult, { kind: "ok" }> => r.kind === "ok");

  const offices = await prisma.office.findMany({ select: { id: true, code: true } });
  const codeByOfficeId = new Map(offices.map((o) => [o.id, o.code] as const));

  const dbEmployees = await prisma.employee.findMany({
    select: { employeeCode: true, lastName: true, firstName: true, officeId: true },
  });
  await prisma.$disconnect();

  const dbByCode = new Map(dbEmployees.map((e) => [e.employeeCode, e] as const));
  const planCodes = new Set(oks.map((r) => r.employee.employeeCode));

  const willUpdate: string[] = [];
  const willCreate: string[] = [];
  const officeMoves: string[] = [];

  for (const r of oks) {
    const e = r.employee;
    const db = dbByCode.get(e.employeeCode);
    const nm = `${e.lastName}${e.firstName ? " " + e.firstName : ""}`;
    if (db) {
      willUpdate.push(`${e.employeeCode} ${nm}`);
      const dbOffice = db.officeId ? (codeByOfficeId.get(db.officeId) ?? "?") : "(なし)";
      if (dbOffice !== (e.officeCode ?? "(なし)")) {
        officeMoves.push(`${e.employeeCode} ${nm}: ${dbOffice} → ${e.officeCode ?? "(なし)"}`);
      }
      const dbName = `${db.lastName}${db.firstName ? " " + db.firstName : ""}`;
      if (dbName !== nm) officeMoves.push(`${e.employeeCode} 氏名: 「${dbName}」→「${nm}」`);
    } else {
      willCreate.push(`${e.employeeCode} ${nm}`);
    }
  }

  const dbOnly = dbEmployees
    .filter((e) => !planCodes.has(e.employeeCode))
    .map((e) => `${e.employeeCode} ${e.lastName}${e.firstName ? " " + e.firstName : ""}`);

  console.error("\n=== 本番照合 (読み取り専用・書き込みなし) ===");
  console.error(`  DB 社員数: ${dbEmployees.length} / CSV 取り込み候補: ${oks.length}`);
  console.error(`  更新 (コード一致): ${willUpdate.length}`);
  console.error(`  新規 (DB に無いコード): ${willCreate.length}`);
  console.error(`  DB のみ (CSV に無い=今回触らない): ${dbOnly.length}`);

  console.error("\n--- 新規になる行 (重複の可能性。雇い入れ日ズレで二重登録に注意) ---");
  if (willCreate.length === 0) console.error("  なし");
  else for (const s of willCreate) console.error(`  + ${s}`);

  console.error("\n--- 拠点 / 氏名が変わる行 ---");
  if (officeMoves.length === 0) console.error("  なし");
  else for (const s of officeMoves) console.error(`  * ${s}`);

  console.error("\n--- DB のみに存在 (CSV から外れた人。今回は残す) ---");
  if (dbOnly.length === 0) console.error("  なし");
  else for (const s of dbOnly) console.error(`  - ${s}`);
}

// ============================================================================
// 6. apply (DB 投入)
// ============================================================================

async function applyToDb(results: RowResult[]): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("../src/lib/password.js");
  const prisma = new PrismaClient();

  const oks = results.filter((r): r is Extract<RowResult, { kind: "ok" }> => r.kind === "ok");
  const errs = results.filter(
    (r): r is Extract<RowResult, { kind: "error" }> => r.kind === "error",
  );

  const offices = await prisma.office.findMany({ select: { id: true, code: true } });
  const officeIdByCode = new Map(offices.map((o) => [o.code, o.id] as const));

  const INITIAL_PASSWORD = "kinntai0000";
  const passwordHash = await hashPassword(INITIAL_PASSWORD);

  type ApplyResult = {
    employeeCode: string;
    name: string;
    status: "created" | "updated" | "error";
    detail: string;
  };
  const applied: ApplyResult[] = [];

  for (const r of oks) {
    const emp = r.employee;
    const fullName = `${emp.lastName}${emp.firstName ? " " + emp.firstName : ""}`;
    const officeId = emp.officeCode ? (officeIdByCode.get(emp.officeCode) ?? null) : null;
    if (emp.officeCode && !officeId) {
      applied.push({
        employeeCode: emp.employeeCode,
        name: fullName,
        status: "error",
        detail: `office code "${emp.officeCode}" が DB に無い`,
      });
      continue;
    }

    try {
      const existing = await prisma.employee.findUnique({
        where: { employeeCode: emp.employeeCode },
        select: { id: true },
      });

      const empData = {
        employeeCode: emp.employeeCode,
        lastName: emp.lastName,
        firstName: emp.firstName,
        lastNameKana: emp.lastNameKana || null,
        firstNameKana: emp.firstNameKana || null,
        birthDate: emp.birthDate ? new Date(`${emp.birthDate}T00:00:00.000Z`) : null,
        officeId,
        jobCategory: emp.jobCategory,
        employmentType: emp.employmentType,
        joinedAt: emp.joinedAt ? new Date(`${emp.joinedAt}T00:00:00.000Z`) : null,
        hiredAt: emp.hiredAt ? new Date(`${emp.hiredAt}T00:00:00.000Z`) : null,
        phone: emp.phone,
        address: emp.address,
        notes: emp.notes,
      };

      let employeeId: string;
      if (existing) {
        await prisma.employee.update({ where: { id: existing.id }, data: empData });
        await prisma.qualification.deleteMany({ where: { employeeId: existing.id } });
        employeeId = existing.id;
      } else {
        const created = await prisma.employee.create({ data: empData, select: { id: true } });
        employeeId = created.id;
      }

      // 雇用契約 (現行 1 行)。同じ開始日の契約が無ければ作成 (履歴は消さない)。
      const hasCurrent = await prisma.employmentContract.findFirst({
        where: {
          employeeId,
          contractStartOn: emp.hiredAt ? new Date(`${emp.hiredAt}T00:00:00.000Z`) : null,
        },
        select: { id: true },
      });
      if (!hasCurrent) {
        await prisma.employmentContract.create({
          data: {
            employeeId,
            contractStartOn: r.contract.contractStartOn
              ? new Date(`${r.contract.contractStartOn}T00:00:00.000Z`)
              : null,
            employmentType: r.contract.employmentType,
            hasEmploymentInsurance: r.contract.hasEmploymentInsurance,
            hasSocialInsurance: r.contract.hasSocialInsurance,
            retirementAllowanceEligible: r.contract.retirementAllowanceEligible,
          },
        });
      }

      for (const q of r.qualifications) {
        await prisma.qualification.create({
          data: { employeeId, qualificationType: q.qualificationType, acquiredOn: null },
        });
      }

      if (r.createUser && emp.email) {
        const existingUser = await prisma.user.findUnique({ where: { email: emp.email } });
        if (!existingUser) {
          await prisma.user.create({
            data: { email: emp.email, passwordHash, role: "EMPLOYEE", employeeId },
          });
        } else if (existingUser.employeeId !== employeeId) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { employeeId, role: "EMPLOYEE" },
          });
        }
      }

      applied.push({
        employeeCode: emp.employeeCode,
        name: fullName,
        status: existing ? "updated" : "created",
        detail:
          (r.qualifications.length > 0 ? `資格 ${r.qualifications.length} 件 ` : "") +
          (r.createUser ? "+ User" : "(User なし)"),
      });
    } catch (e) {
      applied.push({
        employeeCode: emp.employeeCode,
        name: fullName,
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await prisma.$disconnect();

  const created = applied.filter((a) => a.status === "created").length;
  const updated = applied.filter((a) => a.status === "updated").length;
  const errors = applied.filter((a) => a.status === "error");

  console.error("\n=== 投入結果 ===");
  console.error(`  CSV 行数: ${results.length} / 事前エラー: ${errs.length}`);
  console.error(`  作成: ${created} / 更新: ${updated} / 投入時エラー: ${errors.length}`);
  if (errors.length > 0) {
    console.error("\n失敗詳細:");
    for (const e of errors) console.error(`  - ${e.employeeCode} ${e.name}: ${e.detail}`);
    process.exit(1);
  }
  console.error(`\n初期パスワード (User 自動作成分): ${INITIAL_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
