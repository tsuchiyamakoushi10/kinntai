/**
 * 梨花シフトの希望休 まとめ入力 (設計書 §5「希望休の取込」)。
 *
 * 現場の使い方: 管理者が紙やメモで集めた職員の希望休を、月のシフトを組む前に
 * まとめて取り込む。CSV を貼り付けても、手で 1 行ずつ打っても同じ形式で受ける。
 *
 * 1 行 = 「氏名 + 希望休の日付リスト」。区切りは全角/半角どちらでもよい:
 *   五木田秀美 5 12 19
 *   菅原知美, 3, 10
 *   益子：2025-12-08、2025-12-15
 *
 * 氏名は完全一致を優先し、無ければ部分一致 (片方がもう片方を含む) で 1 名に
 * 絞れたら採用する (「五木田」→「五木田秀美」)。日付は「日番号 (1..31)」または
 * 「YYYY-MM-DD」を受け付け、対象月の営業日に限り希望休として採用する。
 *
 * 本モジュールは DB / React に依存しない純粋関数。同じ入力 → 同じ出力。
 */
import { buildRikaMonth } from "./grid";
import type { RikaRequestOffMap } from "./generate";

/** 取込時の注記 (エラーは出すがブロックはしない。設計書 §0「人が直す」前提)。 */
export type RikaRequestNote =
  /** 氏名がロスターに見つからない。 */
  | { line: number; kind: "UNKNOWN_MEMBER"; raw: string; text: string }
  /** 氏名が複数名にマッチして特定できない。 */
  | { line: number; kind: "AMBIGUOUS_MEMBER"; raw: string; text: string; matches: string[] }
  /** 日付の表記が不正、または対象月の範囲外。 */
  | { line: number; kind: "INVALID_DATE"; memberId: string; raw: string }
  /** 営業日でない日 (休業日は元々全員公休なので希望休は不要)。採用しない。 */
  | { line: number; kind: "NON_BUSINESS_DAY"; memberId: string; date: string }
  /** 同じ職員・同じ日が重複して指定された (2 回目以降は無視)。 */
  | { line: number; kind: "DUPLICATE"; memberId: string; date: string }
  /** 氏名だけで日付の指定が無い行。 */
  | { line: number; kind: "NO_DATES"; raw: string; text: string };

export type RikaRequestParseResult = {
  /** memberId -> 希望休の日付 ("YYYY-MM-DD" 昇順・重複排除)。営業日のみ。 */
  requests: RikaRequestOffMap;
  /** 取込時の注記 (確認用)。 */
  notes: RikaRequestNote[];
};

/** 全角の区切り・空白を半角スペースに寄せて、トークン分割しやすくする。 */
function normalizeLine(line: string): string {
  return line
    .replace(/[、，:：]/g, " ") // 区切り文字 → 空白
    .replace(/　/g, " ") // 全角スペース → 半角
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)) // 全角数字 → 半角
    .trim();
}

/** 氏名トークンをロスターの氏名に解決する。 */
function resolveMember(
  token: string,
  memberIds: ReadonlyArray<string>,
): { id: string } | { ambiguous: string[] } | null {
  if (memberIds.includes(token)) return { id: token };
  const partial = memberIds.filter((id) => id.includes(token) || token.includes(id));
  if (partial.length === 1) return { id: partial[0]! };
  if (partial.length > 1) return { ambiguous: partial };
  return null;
}

/** 日付トークン (日番号 or YYYY-MM-DD) を対象月の "YYYY-MM-DD" に解決する。 */
function resolveDate(token: string, ym: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    return token.startsWith(`${ym}-`) ? token : null;
  }
  if (/^\d{1,2}$/.test(token)) {
    const day = Number(token);
    if (day < 1 || day > 31) return null;
    return `${ym}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/**
 * 希望休のまとめ入力テキストを解析する。
 *
 * @param text 1 行 1 職員のテキスト (CSV 貼り付け可)。
 * @param opts.ym 対象月 "YYYY-MM"。
 * @param opts.memberIds ロスターの氏名一覧 (= memberId)。
 */
export function parseRequestOff(
  text: string,
  opts: { ym: string; memberIds: ReadonlyArray<string> },
): RikaRequestParseResult {
  const { ym, memberIds } = opts;
  const month = buildRikaMonth(ym);
  const validDates = new Set(month.map((d) => d.date));
  const businessDates = new Set(month.filter((d) => d.isBusinessDay).map((d) => d.date));

  const requests: Record<string, string[]> = {};
  const seen = new Map<string, Set<string>>(); // memberId -> 採用済み日付
  const notes: RikaRequestNote[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i]!;
    const normalized = normalizeLine(raw);
    if (normalized === "") continue;

    const tokens = normalized.split(/\s+/);
    const nameToken = tokens[0]!;
    const dateTokens = tokens.slice(1);

    const resolved = resolveMember(nameToken, memberIds);
    if (resolved === null) {
      notes.push({ line: lineNo, kind: "UNKNOWN_MEMBER", raw, text: nameToken });
      continue;
    }
    if ("ambiguous" in resolved) {
      notes.push({
        line: lineNo,
        kind: "AMBIGUOUS_MEMBER",
        raw,
        text: nameToken,
        matches: resolved.ambiguous,
      });
      continue;
    }
    const memberId = resolved.id;

    if (dateTokens.length === 0) {
      notes.push({ line: lineNo, kind: "NO_DATES", raw, text: nameToken });
      continue;
    }

    const memberSeen = seen.get(memberId) ?? new Set<string>();
    seen.set(memberId, memberSeen);

    for (const dt of dateTokens) {
      const date = resolveDate(dt, ym);
      if (date === null || !validDates.has(date)) {
        notes.push({ line: lineNo, kind: "INVALID_DATE", memberId, raw: dt });
        continue;
      }
      if (!businessDates.has(date)) {
        notes.push({ line: lineNo, kind: "NON_BUSINESS_DAY", memberId, date });
        continue;
      }
      if (memberSeen.has(date)) {
        notes.push({ line: lineNo, kind: "DUPLICATE", memberId, date });
        continue;
      }
      memberSeen.add(date);
      (requests[memberId] ??= []).push(date);
    }
  }

  // 日付を昇順に整える (決定論的)。
  for (const id of Object.keys(requests)) {
    requests[id]!.sort();
  }

  return { requests, notes };
}
