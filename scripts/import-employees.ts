/**
 * 統合社員マスター CSV を kinntai DB に取り込むスクリプト。
 *
 * 仕様は docs/取り込み指示書.md (チャット内に貼られた指示) に基づく。
 *
 * 実行モード:
 *   pnpm tsx scripts/import-employees.ts dry      ... DB に書かず変換結果のみ出力
 *   pnpm tsx scripts/import-employees.ts apply    ... 実際に DB に投入 (冪等)
 *
 * 入力: /workspaces/kinntai/統合社員マスター_UTF8.csv (BOM 付き UTF-8)
 * 出力 (dry-run): /tmp/dry-run-result.md (人間レビュー用) + stdout サマリ
 */

import fs from "node:fs";

// ============================================================================
// 1. CSV パース (依存追加せず手書き)
// ============================================================================

type RawRow = {
  社員番号: string;
  氏名: string;
  部署: string;
  給与体系: string;
  処遇: string;
  雇い入れ日: string;
  資格: string;
  生年月日: string;
  住所: string;
  電話: string;
  メール: string;
  転換日: string;
  履歴書: string;
  契約書: string;
  資格証: string;
  個人情報保護: string;
  雇用保険: string;
  社保加入: string;
  退職金: string;
  "有料研修(会社負担)": string;
  費用負担: string;
  備考: string;
};

const CSV_PATH = "/workspaces/kinntai/統合社員マスター_UTF8.csv";

function parseCsv(text: string): RawRow[] {
  // BOM 除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0] ?? "";
  const headers = splitCsvLine(headerLine);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row as unknown as RawRow;
  });
}

function splitCsvLine(line: string): string[] {
  // 簡易 CSV: 値内にカンマや改行を含まない前提 (今回の CSV を確認済み)
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

const OFFICE_CODE_BY_LABEL: Record<string, string> = {
  ディサービス結いの心: "DAY-CENTER",
  デイサービス結いの心: "DAY-CENTER",
  ショートステイ結いの心: "SHO-CENTER",
  ディサービス梨花: "DAY-RIKKA",
  デイサービス梨花: "DAY-RIKKA",
};

function mapEmploymentType(v: string): { value: EmploymentType | null; note?: string } {
  const s = v.trim();
  if (s === "正") return { value: "FULL_TIME" };
  if (s === "パート") return { value: "PART_TIME" };
  if (s === "夜勤専従") return { value: "PART_TIME", note: "夜勤専従扱い → PART_TIME に丸めた" };
  if (s === "契約") return { value: "CONTRACT" };
  if (s === "") return { value: null };
  return { value: null, note: `未対応の処遇値: ${s}` };
}

/** 資格 から jobCategory (推定) と qualificationType を導く。 */
function mapQualification(v: string): {
  job: JobCategory | null;
  qual: QualificationType | null;
  trainingName?: string;
  isInferred: boolean;
  raw: string;
  note?: string;
} {
  const s = v.trim();
  if (!s || s === "ー") {
    return { job: null, qual: null, isInferred: false, raw: s };
  }
  // 完全一致 → 推定値
  if (s === "介護福祉士")
    return { job: "CARE_WORKER", qual: "CARE_WORKER", isInferred: true, raw: s };
  if (s === "初任者研修")
    return { job: "CARE_WORKER", qual: "INITIAL_TRAINING", isInferred: true, raw: s };
  if (s === "基礎研修")
    return {
      job: "CARE_WORKER",
      qual: "INITIAL_TRAINING",
      isInferred: true,
      raw: s,
      note: "基礎研修 → INITIAL_TRAINING に丸めた (qualifications enum に該当値なし)",
    };
  if (s === "実務者")
    return { job: "CARE_WORKER", qual: "PRACTICAL_TRAINING", isInferred: true, raw: s };
  if (s === "看護師") return { job: "NURSE", qual: "NURSE", isInferred: true, raw: s };
  if (s === "准看護師")
    return {
      job: "NURSE",
      qual: "NURSE",
      isInferred: true,
      raw: s,
      note: "准看護師 → NURSE に丸めた",
    };
  if (s === "主任ケアマネ")
    return {
      job: "CARE_MANAGER",
      qual: "OTHER",
      isInferred: true,
      raw: s,
      note: "主任ケアマネ → qualifications は OTHER",
    };
  if (s === "主事")
    return {
      job: "LIFE_COUNSELOR",
      qual: "OTHER",
      isInferred: true,
      raw: s,
      note: "社会福祉主事 → qualifications は OTHER",
    };
  if (s === "調理師")
    return {
      job: "OTHER",
      qual: "OTHER",
      isInferred: true,
      raw: s,
      note: "調理師 (厨房の可能性 → 拠点と合わせて要確認)",
    };
  if (s === "柔整師")
    return { job: "OTHER", qual: "OTHER", isInferred: true, raw: s, note: "柔整師 → OTHER" };
  return { job: null, qual: null, isInferred: false, raw: s, note: `未対応の資格: ${s}` };
}

function parseMaru(v: string): { value: boolean | null; raw: string; note?: string } {
  const s = v.trim();
  if (!s) return { value: null, raw: s };
  if (s === "〇" || s === "○" || s === "◯") return { value: true, raw: s };
  if (s === "×") return { value: false, raw: s };
  return { value: null, raw: s, note: `bool 化できない値: ${s}` };
}

function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function splitName(full: string): { last: string; first: string; split: boolean } {
  const s = full.trim();
  if (!s) return { last: "", first: "", split: false };
  // スペース区切り (全角/半角) があれば分割
  const m = s.match(/^(\S+)[\s　]+(\S+)$/);
  if (m) return { last: m[1] ?? "", first: m[2] ?? "", split: true };
  // 機械分割せず、全部 lastName に入れる
  return { last: s, first: "", split: false };
}

function paddedEmployeeCode(n: number): string {
  return `E${String(n).padStart(4, "0")}`;
}

function makeImportedEmployeeCode(name: string, hiredAt: string | null): string {
  // 社員番号なしの行用。同じ氏名 + 雇い入れ日からは同じコードが出るように。
  const seed = `${name}|${hiredAt ?? ""}`;
  // 簡易ハッシュ (FNV-1a 32bit)
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
type TrainingPlan = { trainingName: string; trainingType: "COMPANY_PAID"; note: string };

type EmployeePlan = {
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string; // 必ず空
  firstNameKana: string; // 必ず空
  birthDate: string | null;
  officeCode: string | null;
  jobCategory: JobCategory | null;
  jobCategoryInferred: boolean;
  employmentType: EmploymentType | null;
  joinedAt: string | null; // CSV に列が無いので常に null
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
  retirementAllowanceNote: string | null; // 〇×以外の値が来た時に notes に退避
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
      trainings: TrainingPlan[];
      review: string[]; // 要確認項目
      createUser: boolean;
      duplicateKey: string;
    }
  | {
      kind: "error";
      idx: number;
      raw: RawRow;
      reason: string;
    };

function transformRow(row: RawRow, idx: number): RowResult {
  // 氏名なしは即エラー
  if (!row.氏名.trim()) {
    return { kind: "error", idx, raw: row, reason: "氏名が空欄" };
  }

  const review: string[] = [];

  // ---- employees ----
  const name = splitName(row.氏名);
  if (!name.split) {
    review.push("氏名を姓・名に分割できなかった (firstName 空)");
  }

  // 社員番号 → employeeCode
  const numStr = row.社員番号.trim();
  let employeeCode: string;
  if (numStr) {
    const n = Math.floor(Number(numStr));
    if (Number.isFinite(n) && n > 0) {
      employeeCode = paddedEmployeeCode(n);
    } else {
      return { kind: "error", idx, raw: row, reason: `社員番号が不正: ${numStr}` };
    }
  } else {
    employeeCode = makeImportedEmployeeCode(row.氏名.trim(), parseDateLoose(row.雇い入れ日));
    review.push(`社員番号なし → ${employeeCode} を採番`);
  }

  const birthDate = parseDateLoose(row.生年月日);
  if (!birthDate) review.push("生年月日 空欄");

  const officeCode = OFFICE_CODE_BY_LABEL[row.部署.trim()] ?? null;
  if (!officeCode) {
    if (!row.部署.trim()) review.push("拠点 空欄");
    else review.push(`拠点 未対応 (${row.部署.trim()})`);
  }

  const qmap = mapQualification(row.資格);
  if (!qmap.job) review.push(`職種 推定不可 (資格=${qmap.raw || "空欄"})`);
  else if (qmap.isInferred) review.push(`職種 推定値 (${qmap.raw} → ${qmap.job})`);

  const emp = mapEmploymentType(row.処遇);
  if (!emp.value) review.push(`雇用形態 不明 (処遇=${row.処遇 || "空欄"})`);
  if (emp.note) review.push(emp.note);

  const hiredAt = parseDateLoose(row.雇い入れ日);
  if (!hiredAt) review.push("雇い入れ日 空欄");

  const notesParts: string[] = [];
  if (row.備考.trim()) notesParts.push(row.備考.trim());
  if (row.給与体系.trim()) notesParts.push(`給与体系: ${row.給与体系.trim()}`);
  if (row.転換日.trim()) notesParts.push(`転換日: ${row.転換日.trim()}`);

  // ---- 退職金 ---- 〇×なら contracts.retirementAllowanceEligible、それ以外は notes
  const retMaru = parseMaru(row.退職金);
  const contractRetAllowance: boolean | null = retMaru.value;
  let contractRetNote: string | null = null;
  if (retMaru.value === null && row.退職金.trim()) {
    // 〇×以外 (日付・金額・テキスト)
    contractRetNote = `退職金欄: ${row.退職金.trim()}`;
    notesParts.push(contractRetNote);
    review.push(`退職金 bool 化不可 (${row.退職金.trim()}) → notes へ退避`);
  }

  // ---- 必須項目欄空欄チェック ----
  if (!birthDate) review.push("[必須] birthDate 空欄");
  if (!officeCode) review.push("[必須] officeId 空欄");
  if (!qmap.job) review.push("[必須] jobCategory 未設定");
  if (!emp.value) review.push("[必須] employmentType 不明");
  if (!hiredAt) review.push("[必須] hiredAt 空欄");
  review.push("[必須] joinedAt は CSV 列なし → 全件空欄");
  review.push("[必須] weeklyWorkDays / dailyWorkHours は CSV に無し → 空欄");
  review.push("[必須] baseWageType / baseWageAmount は CSV に無し → 空欄");
  review.push("[必須] lastNameKana / firstNameKana は CSV に無し → 空欄");

  // ---- User ----
  const email = row.メール.trim() || null;
  const createUser = !!email;
  if (!createUser) review.push("メール空欄 → User 自動作成スキップ");

  // ---- 雇用契約 (現契約 1 行) ----
  const employmentInsurance = parseMaru(row.雇用保険);
  const socialInsurance = parseMaru(row.社保加入);
  const contract: ContractPlan = {
    contractStartOn: hiredAt,
    employmentType: emp.value,
    hasEmploymentInsurance: employmentInsurance.value,
    hasSocialInsurance: socialInsurance.value,
    retirementAllowanceEligible: contractRetAllowance,
    retirementAllowanceNote: contractRetNote,
  };

  // ---- qualifications ----
  const qualifications: QualificationPlan[] = [];
  if (qmap.qual) {
    qualifications.push({
      qualificationType: qmap.qual,
      raw: qmap.raw,
      note: qmap.note ?? "",
    });
  }

  // ---- employee_documents ----
  const documents: DocumentPlan[] = [];
  const docMap: { col: string; type: DocumentType; title: string }[] = [
    { col: row.履歴書, type: "RESUME", title: "履歴書" },
    { col: row.契約書, type: "EMPLOYMENT_CONTRACT", title: "雇用契約書" },
    { col: row.資格証, type: "QUALIFICATION_CERT", title: "資格証" },
    { col: row.個人情報保護, type: "PRIVACY_CONSENT", title: "個人情報保護同意書" },
  ];
  for (const d of docMap) {
    const m = parseMaru(d.col);
    if (m.value === true) {
      documents.push({
        documentType: d.type,
        title: d.title,
        note: "CSV では「あり」フラグのみ。実ファイル無し",
      });
    } else if (m.value === null && d.col.trim() && m.note) {
      review.push(`${d.title} ${m.note}`);
    }
  }
  if (documents.length > 0) {
    review.push(
      `書類 ${documents.length} 件 (履歴書/契約書/資格証/個人情報) は「あり」フラグだけで実ファイルなし → metadata のみ作成 or 作らないを要判断`,
    );
  }

  // ---- training_records ----
  const trainings: TrainingPlan[] = [];
  const trCol = row["有料研修(会社負担)"].trim();
  if (trCol) {
    // "認知症基礎研修" / "実務者研修受講" / "ケアマネ更新費用" 等
    // 「・」で複数あれば分割
    const items = trCol
      .split(/[・、]/)
      .map((s) => s.trim())
      .filter((s) => !!s);
    for (const it of items) {
      trainings.push({
        trainingName: it,
        trainingType: "COMPANY_PAID",
        note: "trainedOn 不明 (要確認)",
      });
    }
    review.push(`研修 ${trainings.length} 件は trainedOn 不明 → 後で日付追記必要`);
  }
  const costBurden = row.費用負担.trim();
  if (costBurden) {
    notesParts.push(`費用負担: ${costBurden}`);
  }

  const employee: EmployeePlan = {
    employeeCode,
    lastName: name.last,
    firstName: name.first,
    lastNameKana: "",
    firstNameKana: "",
    birthDate,
    officeCode,
    jobCategory: qmap.job,
    jobCategoryInferred: qmap.isInferred,
    employmentType: emp.value,
    joinedAt: null,
    hiredAt,
    phone: row.電話.trim() || null,
    address: row.住所.trim() || null,
    email,
    notes: notesParts.length > 0 ? notesParts.join(" / ") : null,
  };

  // 冪等キー: 社員番号があればそれ、なければ 氏名+生年月日 (生年月日無いと弱いが衝突は確認時に判断)
  const duplicateKey = numStr
    ? `code:${employeeCode}`
    : `nb:${row.氏名.trim()}|${birthDate ?? "no-bd"}`;

  return {
    kind: "ok",
    idx,
    raw: row,
    employee,
    contract,
    qualifications,
    documents,
    trainings,
    review,
    createUser,
    duplicateKey,
  };
}

// ============================================================================
// 4. Markdown 出力
// ============================================================================

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "_(空欄)_";
  if (v === "") return "_(空欄)_";
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
  lines.push(`- 総行数: ${results.length}`);
  lines.push(`- 取り込み候補: ${oks.length}`);
  lines.push(`- エラー (氏名なし等): ${errs.length}`);
  lines.push("");

  // ---- エラー一覧 ----
  lines.push("## ❌ エラー行 (DB に投入しない)");
  lines.push("");
  if (errs.length === 0) {
    lines.push("なし");
  } else {
    lines.push("| # | 理由 | 行データ抜粋 |");
    lines.push("|---|---|---|");
    for (const e of errs) {
      const ex =
        [e.raw.社員番号, e.raw.氏名, e.raw.住所, e.raw.電話, e.raw.メール]
          .filter((s) => s)
          .join(" / ") || "(全部空)";
      lines.push(`| row${e.idx + 2} | ${e.reason} | ${ex} |`);
    }
  }
  lines.push("");

  // ---- 必須項目で全件 NULL になるカラム ----
  lines.push("## ⚠ 必須カラムなのに CSV 列が無いため全件 NULL になるもの");
  lines.push("");
  lines.push("Prisma スキーマ上 `NOT NULL` だが今回の CSV では値が拾えないため、");
  lines.push(
    "実投入する際に **スキーマを nullable に変更** するか **暫定値を入れる** かの判断が必要。",
  );
  lines.push("");
  lines.push("| テーブル | カラム | 現スキーマ | 影響行数 |");
  lines.push("|---|---|---|---|");
  lines.push("| employees | `lastNameKana` | String NOT NULL | 全件 |");
  lines.push("| employees | `firstNameKana` | String NOT NULL | 全件 |");
  lines.push("| employees | `joinedAt` | Date NOT NULL | 全件 |");
  lines.push("| employees | `weeklyWorkDays` | Decimal NOT NULL | 全件 |");
  lines.push("| employees | `dailyWorkHours` | Decimal NOT NULL | 全件 |");
  lines.push("| employees | `baseWageType` | Enum NOT NULL | 全件 |");
  lines.push("| employees | `baseWageAmount` | Int NOT NULL | 全件 |");
  lines.push("| employees | `birthDate` | Date NOT NULL | 空欄行のみ |");
  lines.push("| employees | `officeId` | String NOT NULL | 空欄行のみ |");
  lines.push("| employees | `jobCategory` | Enum NOT NULL | 推定不可行のみ |");
  lines.push("| employees | `employmentType` | Enum NOT NULL | 空欄行のみ |");
  lines.push("| employees | `hiredAt` | Date NOT NULL | 空欄行のみ |");
  lines.push("| employment_contracts | `workingHoursPerDay` | Decimal NOT NULL | 全件 |");
  lines.push("| employment_contracts | `workingDaysPerWeek` | Decimal NOT NULL | 全件 |");
  lines.push("| employment_contracts | `wageType` | Enum NOT NULL | 全件 |");
  lines.push("| employment_contracts | `wageAmount` | Int NOT NULL | 全件 |");
  lines.push("| employment_contracts | `isRenewable` | Boolean NOT NULL | 全件 |");
  lines.push(
    "| employment_contracts | `hasEmploymentInsurance` | Boolean NOT NULL | 値が空欄の行のみ |",
  );
  lines.push(
    "| employment_contracts | `hasSocialInsurance` | Boolean NOT NULL | 値が空欄の行のみ |",
  );
  lines.push("| qualifications | `acquiredOn` | Date NOT NULL | 資格あり全件 |");
  lines.push("| training_records | `trainedOn` | Date NOT NULL | 研修あり全件 |");
  lines.push(
    "| employee_documents | `storageKey` / `fileName` / `mimeType` / `fileSize` / `uploadedById` | NOT NULL | 書類フラグあり全件 (実ファイル無し) |",
  );
  lines.push("");
  lines.push(
    "> 指示書の「テーブル定義は変更しない」と「暫定値を入れない」は技術的に両立しません。",
  );
  lines.push(
    "> 本投入には A/B どちらかの選択が必要です。詳細は本文末尾の「本投入に必要な対応」参照。",
  );
  lines.push("");

  // ---- 各行サマリ ----
  lines.push("## 📋 行ごとの変換プレビュー");
  lines.push("");
  for (const r of oks) {
    lines.push(
      `### row${r.idx + 2}: ${r.employee.lastName}${r.employee.firstName ? " " + r.employee.firstName : ""} (${r.employee.employeeCode})`,
    );
    lines.push("");
    lines.push("**employees**");
    lines.push("");
    lines.push("| 項目 | 値 |");
    lines.push("|---|---|");
    lines.push(`| employeeCode | ${r.employee.employeeCode} |`);
    lines.push(
      `| lastName / firstName | ${fmtVal(r.employee.lastName)} / ${fmtVal(r.employee.firstName)} |`,
    );
    lines.push(`| lastNameKana / firstNameKana | _(両方空)_ |`);
    lines.push(`| birthDate | ${fmtVal(r.employee.birthDate)} |`);
    lines.push(`| officeCode (→ officeId) | ${fmtVal(r.employee.officeCode)} |`);
    lines.push(
      `| jobCategory | ${fmtVal(r.employee.jobCategory)}${r.employee.jobCategoryInferred ? " *(推定)*" : ""} |`,
    );
    lines.push(`| employmentType | ${fmtVal(r.employee.employmentType)} |`);
    lines.push(`| joinedAt | _(空欄: CSV に列なし)_ |`);
    lines.push(`| hiredAt | ${fmtVal(r.employee.hiredAt)} |`);
    lines.push(`| phone | ${fmtVal(r.employee.phone)} |`);
    lines.push(`| address | ${fmtVal(r.employee.address)} |`);
    lines.push(
      `| email (→ User) | ${fmtVal(r.employee.email)}${r.createUser ? " *(User 作成)*" : " *(User 作成スキップ)*"} |`,
    );
    lines.push(`| notes | ${fmtVal(r.employee.notes)} |`);
    lines.push("");

    lines.push("**employment_contracts** (1 行作成)");
    lines.push("");
    lines.push("| 項目 | 値 |");
    lines.push("|---|---|");
    lines.push(`| contractStartOn | ${fmtVal(r.contract.contractStartOn)} |`);
    lines.push(`| employmentType | ${fmtVal(r.contract.employmentType)} |`);
    lines.push(`| hasEmploymentInsurance | ${fmtVal(r.contract.hasEmploymentInsurance)} |`);
    lines.push(`| hasSocialInsurance | ${fmtVal(r.contract.hasSocialInsurance)} |`);
    lines.push(
      `| retirementAllowanceEligible | ${fmtVal(r.contract.retirementAllowanceEligible)} |`,
    );
    if (r.contract.retirementAllowanceNote) {
      lines.push(`| (退避) | ${r.contract.retirementAllowanceNote} |`);
    }
    lines.push("");

    if (r.qualifications.length > 0) {
      lines.push("**qualifications**");
      lines.push("");
      for (const q of r.qualifications) {
        lines.push(`- ${q.qualificationType}（CSV: ${q.raw}）${q.note ? " — " + q.note : ""}`);
      }
      lines.push("");
    }

    if (r.documents.length > 0) {
      lines.push("**employee_documents** (フラグから作成想定)");
      lines.push("");
      for (const d of r.documents) {
        lines.push(`- ${d.documentType} / ${d.title} — ${d.note}`);
      }
      lines.push("");
    }

    if (r.trainings.length > 0) {
      lines.push("**training_records**");
      lines.push("");
      for (const t of r.trainings) {
        lines.push(`- ${t.trainingName}（${t.trainingType}） — ${t.note}`);
      }
      lines.push("");
    }

    if (r.review.length > 0) {
      lines.push("**要確認**");
      lines.push("");
      for (const rv of r.review) {
        lines.push(`- ${rv}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  // ---- 要確認まとめ ----
  lines.push("## 🔍 要確認サマリ (項目別)");
  lines.push("");
  const counts: Record<string, string[]> = {};
  for (const r of oks) {
    for (const rv of r.review) {
      const key = rv.replace(/\(.*?\)/g, "").trim();
      counts[key] ??= [];
      counts[key].push(r.employee.employeeCode);
    }
  }
  const keys = Object.keys(counts).sort();
  lines.push("| 項目 | 件数 |");
  lines.push("|---|---|");
  for (const k of keys) {
    lines.push(`| ${k} | ${counts[k]?.length ?? 0} |`);
  }
  lines.push("");

  // ---- 本投入に必要な対応 ----
  lines.push("## 🛠 本投入に必要な対応 (要判断)");
  lines.push("");
  lines.push("指示書では「テーブル定義は変えない」「暫定値は入れない」とあるが、");
  lines.push("Prisma スキーマには CSV に無い NOT NULL カラムが多数あるため両立できない。");
  lines.push("以下から選択してください:");
  lines.push("");
  lines.push("### 案 A: スキーマを nullable に変更");
  lines.push("");
  lines.push("以下のカラムを `?` (nullable) に変更し migration を流す。");
  lines.push("既存データには既に値が入っているため後方互換性あり。");
  lines.push("");
  lines.push(
    "- employees.{lastNameKana, firstNameKana, birthDate, officeId, jobCategory, employmentType, joinedAt, hiredAt, weeklyWorkDays, dailyWorkHours, baseWageType, baseWageAmount}",
  );
  lines.push(
    "- employment_contracts.{workingHoursPerDay, workingDaysPerWeek, wageType, wageAmount, isRenewable, hasEmploymentInsurance, hasSocialInsurance}",
  );
  lines.push("- qualifications.acquiredOn");
  lines.push("- training_records.trainedOn");
  lines.push("");
  lines.push("### 案 B: 暫定値を入れる");
  lines.push("");
  lines.push('カナ・空欄文字列 ""、数値カラム 0、日付カラム 1900-01-01、enum 既定値等を入れる。');
  lines.push('既存仕様の "暫定値NG" 原則と矛盾。');
  lines.push("");
  lines.push("### 案 C: employee_documents / training_records は今回投入しない");
  lines.push("");
  lines.push(
    "ファイル本体が無い書類と日付が不明な研修だけ別途扱い、employees / contracts / qualifications のみ案 A で投入。",
  );
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// 5. main
// ============================================================================

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "dry";
  if (mode !== "dry" && mode !== "apply") {
    console.error("Usage: pnpm tsx scripts/import-employees.ts [dry|apply]");
    process.exit(2);
  }

  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(csv);
  console.error(`parsed ${rows.length} rows from ${CSV_PATH}`);

  const results = rows.map((row, idx) => transformRow(row, idx));

  // 重複キーの衝突チェック
  const keyToIdx = new Map<string, number[]>();
  for (const r of results) {
    if (r.kind !== "ok") continue;
    const arr = keyToIdx.get(r.duplicateKey) ?? [];
    arr.push(r.idx);
    keyToIdx.set(r.duplicateKey, arr);
  }
  const collisions = [...keyToIdx.entries()].filter(([, v]) => v.length > 1);
  if (collisions.length > 0) {
    console.error("\n!! 冪等キー衝突あり:");
    for (const [k, v] of collisions) {
      console.error(`   ${k} : rows ${v.map((i) => i + 2).join(", ")}`);
    }
  }

  if (mode === "dry") {
    const md = renderMarkdown(results);
    const out = "/tmp/dry-run-result.md";
    fs.writeFileSync(out, md);
    console.error(`\n✅ dry-run 完了`);
    console.error(`   出力: ${out}`);
    const oks = results.filter((r) => r.kind === "ok").length;
    const errs = results.filter((r) => r.kind === "error").length;
    console.error(`   取り込み候補 ${oks} 件 / エラー ${errs} 件`);
    console.error("");
    console.error("次のステップ: 上記ファイルを開いて確認 → OK なら apply モードへ");
    return;
  }

  // ---- apply モード ----
  await applyToDb(results);
}

// ============================================================================
// 6. apply (DB 投入)
// ============================================================================

async function applyToDb(results: RowResult[]): Promise<void> {
  // 遅延 import: dry モードで Prisma 接続を作らずに済むようにする。
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("../src/lib/password.js");
  const prisma = new PrismaClient();

  const oks = results.filter((r): r is Extract<RowResult, { kind: "ok" }> => r.kind === "ok");
  const errs = results.filter(
    (r): r is Extract<RowResult, { kind: "error" }> => r.kind === "error",
  );

  // 拠点コード → ID
  const offices = await prisma.office.findMany({ select: { id: true, code: true } });
  const officeIdByCode = new Map(offices.map((o) => [o.code, o.id] as const));

  const INITIAL_PASSWORD = "kinntai0000";
  const passwordHash = await hashPassword(INITIAL_PASSWORD);

  type ApplyResult = {
    employeeCode: string;
    name: string;
    status: "created" | "updated" | "skipped" | "error";
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
      // 冪等判定: 社員コードで existing を探す。
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
        joinedAt: null,
        hiredAt: emp.hiredAt ? new Date(`${emp.hiredAt}T00:00:00.000Z`) : null,
        phone: emp.phone,
        address: emp.address,
        notes: emp.notes,
      };

      let employeeId: string;
      if (existing) {
        // 既存。基本情報を upsert 更新するが、関連 (契約・資格・書類・研修) は重複しないよう削除→再投入。
        await prisma.employee.update({ where: { id: existing.id }, data: empData });
        await prisma.qualification.deleteMany({ where: { employeeId: existing.id } });
        await prisma.trainingRecord.deleteMany({ where: { employeeId: existing.id } });
        // employment_contracts は履歴なので削除しない。
        employeeId = existing.id;
      } else {
        const created = await prisma.employee.create({ data: empData, select: { id: true } });
        employeeId = created.id;
      }

      // 雇用契約 (現行 1 行)。既存があれば最新を更新ではなく追記方針。
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
            workingHoursPerDay: null,
            workingDaysPerWeek: null,
            wageType: null,
            wageAmount: null,
            isRenewable: null,
            hasEmploymentInsurance: r.contract.hasEmploymentInsurance,
            hasSocialInsurance: r.contract.hasSocialInsurance,
            retirementAllowanceEligible: r.contract.retirementAllowanceEligible,
          },
        });
      }

      // 資格
      for (const q of r.qualifications) {
        await prisma.qualification.create({
          data: {
            employeeId,
            qualificationType: q.qualificationType,
            acquiredOn: null,
          },
        });
      }

      // 研修
      for (const t of r.trainings) {
        await prisma.trainingRecord.create({
          data: {
            employeeId,
            trainingName: t.trainingName,
            trainingType: t.trainingType,
            trainedOn: null,
          },
        });
      }

      // User (メールがあれば)
      if (r.createUser && emp.email) {
        const existingUser = await prisma.user.findUnique({ where: { email: emp.email } });
        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: emp.email,
              passwordHash,
              role: "EMPLOYEE",
              employeeId,
            },
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
          (r.trainings.length > 0 ? `研修 ${r.trainings.length} 件 ` : "") +
          (r.createUser ? "+ User" : "(User なし)"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      applied.push({
        employeeCode: emp.employeeCode,
        name: fullName,
        status: "error",
        detail: msg,
      });
    }
  }

  await prisma.$disconnect();

  // ---- 結果サマリ ----
  const created = applied.filter((a) => a.status === "created").length;
  const updated = applied.filter((a) => a.status === "updated").length;
  const errors = applied.filter((a) => a.status === "error");

  console.error("");
  console.error("=== 投入結果 ===");
  console.error(`  CSV 行数: ${results.length}`);
  console.error(`  事前エラー (氏名なし等): ${errs.length}`);
  console.error(`  作成: ${created}`);
  console.error(`  更新: ${updated}`);
  console.error(`  投入時エラー: ${errors.length}`);

  if (errors.length > 0) {
    console.error("");
    console.error("失敗詳細:");
    for (const e of errors) {
      console.error(`  - ${e.employeeCode} ${e.name}: ${e.detail}`);
    }
    process.exit(1);
  }

  console.error("");
  console.error("任意化したバリデーション (スキーマ migration で nullable 化したカラム):");
  console.error("  employees: lastNameKana, firstNameKana, birthDate, officeId, jobCategory,");
  console.error("             employmentType, joinedAt, hiredAt, weeklyWorkDays, dailyWorkHours,");
  console.error("             baseWageType, baseWageAmount");
  console.error("  employment_contracts: contractStartOn, employmentType, workingHoursPerDay,");
  console.error("             workingDaysPerWeek, wageType, wageAmount, isRenewable,");
  console.error("             hasEmploymentInsurance, hasSocialInsurance");
  console.error("  qualifications: acquiredOn");
  console.error("  training_records: trainedOn");
  console.error("");
  console.error(`初期パスワード (User 自動作成分): ${INITIAL_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
