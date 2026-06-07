/**
 * 梨花の確定メンバー (RIKA_ROSTER) を社員マスターと突き合わせて解決する。
 *
 * 設計書 §1/§6-1: 「社員マスターから梨花メンバーを抽出し、6 名を一覧表示して確認」。
 * オーナー確認 (2026-06-03) で「6 名は設計書の記載を正とする」方針のため、
 * ロスター (config) を主、社員マスター (CSV) を従として突合し、食い違いは
 * discrepancies として surface する (実装をブロックはしない)。
 *
 * 本モジュールは I/O を持たない純粋関数。CSV の読み込み・表示は呼び出し側 (script /
 * server component) が担う。これによりテストを DB / ファイルなしで書ける。
 */
import {
  RIKA_MASTER_OFFICE_CODE,
  RIKA_ROSTER,
  RIKA_SYMBOLS,
  type RikaEmploymentClass,
  type RikaRosterMember,
} from "./config";

/** 社員マスター 1 行のうち、突合に必要な項目だけを抜き出した型。 */
export type MasterRow = {
  /** 氏名 (姓名結合)。 */
  name: string;
  /** 拠点コード (CSV の「拠点コード」列。例: RIKA / DEY / SHORT / NH)。 */
  officeCode: string;
  /** 兼務先 (CSV の「兼務先」列。例: "RIKA" / "NH(午前)・DEY(午後)・RIKA(午後)")。空欄は ""。 */
  kenmuSaki: string;
  /** 雇用形態 (CSV の「雇用形態」列。例: FULL_TIME / PART_TIME)。空欄は ""。 */
  employmentType: string;
  /** 職種 推定 (CSV の「職種(推定)」列。例: CAREGIVER)。空欄は ""。 */
  jobCategory: string;
};

/**
 * その行が梨花の対象者か (設計書 §1 の抽出条件)。
 * 拠点コードが RIKA、または 兼務先に RIKA を含む。
 */
export function belongsToRika(row: Pick<MasterRow, "officeCode" | "kenmuSaki">): boolean {
  return (
    row.officeCode === RIKA_MASTER_OFFICE_CODE || row.kenmuSaki.includes(RIKA_MASTER_OFFICE_CODE)
  );
}

export type ResolvedRikaMember = {
  /** ロスター (設計書) 側の定義。配置ロジックはこちらを正とする。 */
  roster: RikaRosterMember;
  /** 突合できた社員マスター行 (見つからなければ null)。 */
  master: MasterRow | null;
  /** 氏名が完全一致で突合できたか (false = 姓の前方一致で代替突合 or 未発見)。 */
  exactNameMatch: boolean;
  /** 設計書とマスターの食い違い (人間が確認すべき注記)。 */
  discrepancies: ReadonlyArray<string>;
};

/** 表示用に空白を除いた氏名を返す。 */
function normalizeName(name: string): string {
  return name.replace(/[\s　]/g, "");
}

/** 設計書の勤務形態 ↔ CSV の雇用形態 を比較できる形に正規化する。 */
function classFromEmploymentType(employmentType: string): RikaEmploymentClass | null {
  const v = employmentType.trim().toUpperCase();
  if (v === "FULL_TIME" || v === "CONTRACT") return "full";
  if (v === "PART_TIME") return "part";
  return null;
}

/**
 * ロスター 1 名を社員マスターに突き合わせる。
 *   1. 氏名 完全一致を優先
 *   2. 無ければ姓 (先頭 2 文字) の前方一致で代替候補を探す (氏名タイプミス検出用)
 */
function matchMaster(
  member: RikaRosterMember,
  master: ReadonlyArray<MasterRow>,
): { row: MasterRow | null; exact: boolean } {
  const target = normalizeName(member.name);
  const exact = master.find((r) => normalizeName(r.name) === target);
  if (exact) return { row: exact, exact: true };

  const surname = target.slice(0, 2);
  const fuzzy = master.filter((r) => normalizeName(r.name).startsWith(surname));
  // 候補がちょうど 1 件のときだけ「氏名違いの同一人物候補」とみなす。
  if (fuzzy.length === 1) return { row: fuzzy[0]!, exact: false };
  return { row: null, exact: false };
}

/** ロスター 6 名を社員マスターと突合し、解決結果と食い違いを返す。 */
export function resolveRikaMembers(master: ReadonlyArray<MasterRow>): ResolvedRikaMember[] {
  return RIKA_ROSTER.map((roster): ResolvedRikaMember => {
    const { row, exact } = matchMaster(roster, master);
    const discrepancies: string[] = [];

    if (!row) {
      discrepancies.push("社員マスターに該当者が見つかりません");
      return { roster, master: null, exactNameMatch: false, discrepancies };
    }

    if (!exact) {
      discrepancies.push(`氏名不一致: マスターは「${row.name}」`);
    }

    // 拠点コードの確認。RIKA 直属なら問題なし。
    // RIKA 直属でなくても兼務先に RIKA があれば「兼務応援」(想定どおり)。
    // どちらでもなければ食い違い (梨花対象として扱えない)。
    if (row.officeCode !== RIKA_MASTER_OFFICE_CODE) {
      if (row.kenmuSaki.includes(RIKA_MASTER_OFFICE_CODE)) {
        discrepancies.push(`兼務応援: 主たる拠点は ${row.officeCode || "(空欄)"} (兼務先に梨花)`);
      } else {
        discrepancies.push(
          `拠点コード不一致: マスターは ${row.officeCode || "(空欄)"} / 兼務先にも梨花なし (設計書は梨花所属)`,
        );
      }
    }

    // 勤務形態の食い違い。
    const masterClass = classFromEmploymentType(row.employmentType);
    if (masterClass && masterClass !== roster.employmentClass) {
      discrepancies.push(
        `勤務形態不一致: 設計書=${roster.employmentClass} / マスター=${row.employmentType}`,
      );
    }

    return { roster, master: row, exactNameMatch: exact, discrepancies };
  });
}

/** 配置可能な勤務記号を表示用ラベルに変換する (例: ["半日F", "半午"])。 */
export function symbolLabels(member: RikaRosterMember): string[] {
  return member.allowedSymbols.map((code) => RIKA_SYMBOLS[code].label);
}
