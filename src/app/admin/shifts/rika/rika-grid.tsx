"use client";

/**
 * 梨花シフト 表示グリッド (設計書 §4)。
 *
 * ステップ2 では「表示」のみ: 職員 × 日付のセル、休業日グレーアウト、土日色分け、
 * 下段の午前/午後 集計行 (不足=赤 / 余剰=青 / 充足=緑)、右端の勤務日数。
 * 自動生成・ドラッグ&ドロップ・クリック変更・保存は後続ステップで追加する。
 * cells をローカル state に持たせ、後続ステップで編集できる土台にしておく。
 */
import { useMemo, useState, useTransition } from "react";

import { RIKA_STAFFING, symbolDef, type RikaSymbolCode } from "@/lib/shift/rika/config";
import {
  generateRikaShifts,
  type RikaGenMember,
  type RikaWarning,
} from "@/lib/shift/rika/generate";
import { parseRequestOff, type RikaRequestNote } from "@/lib/shift/rika/requests";
import { buildRikaCsv } from "@/lib/shift/rika/export";

import { saveRikaShifts, type RikaSaveResult } from "./actions";
import {
  countWorkdays,
  dayCoverage,
  type Coverage,
  type RikaCell,
  type RikaDay,
} from "@/lib/shift/rika/grid";

type Member = {
  id: string;
  name: string;
  employmentClass: "full" | "part";
  jobLabel: string;
  targetWorkDays: number | null;
  maxWorkDaysPerWeek: number | null;
  isHelper: boolean;
  allowedSymbols: RikaSymbolCode[];
  note: string | null;
};

type Props = {
  ym: string;
  prevYm: string;
  nextYm: string;
  days: ReadonlyArray<RikaDay>;
  members: ReadonlyArray<Member>;
};

/** 勤務記号 → セルの色 (設計書: 終日緑 / 午前薄緑 / 午後橙 / 公灰 / 有青 / 希望ピンク)。 */
function symbolClass(code: RikaSymbolCode): string {
  const s = symbolDef(code);
  if (code === "OFF") return "bg-slate-200 text-slate-500";
  if (code === "PAID_LEAVE") return "bg-sky-200 text-sky-900";
  if (code === "REQUESTED_OFF") return "bg-pink-200 text-pink-900";
  if (s.am === 1 && s.pm === 1) return "bg-green-200 text-green-900"; // 終日系
  if (s.am === 1) return "bg-lime-100 text-lime-900"; // 午前のみ
  if (s.pm === 1) return "bg-orange-200 text-orange-900"; // 午後のみ
  return "bg-white text-slate-700";
}

/** 充足状況 → 集計セルの色 (不足=赤 / 余剰=青 / 充足=緑)。 */
function coverageClass(c: Coverage): string {
  if (c === "short") return "bg-red-100 text-red-700 font-semibold";
  if (c === "surplus") return "bg-blue-100 text-blue-700 font-semibold";
  return "bg-green-100 text-green-700";
}

function dowClass(day: RikaDay): string {
  if (day.dow === 0 || day.isHoliday) return "text-red-600";
  if (day.dow === 6) return "text-blue-600";
  return "text-slate-600";
}

export function RikaGrid({ ym, prevYm, nextYm, days, members }: Props) {
  // 配置データ。自動生成・手修正でここを更新する。
  const [cells, setCells] = useState<ReadonlyArray<RikaCell>>([]);
  const [warnings, setWarnings] = useState<ReadonlyArray<RikaWarning>>([]);

  // 希望休まとめ入力 (設計書 §5)。
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [requestNotes, setRequestNotes] = useState<ReadonlyArray<RikaRequestNote>>([]);
  const [requestApplied, setRequestApplied] = useState<number | null>(null);

  // DB 保存 (設計書 §6)。
  const [saving, startSaving] = useTransition();
  const [saveResult, setSaveResult] = useState<RikaSaveResult | null>(null);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, RikaSymbolCode>();
    for (const c of cells) m.set(`${c.memberId}|${c.date}`, c.symbol);
    return m;
  }, [cells]);

  function autoGenerate(): void {
    const genMembers: RikaGenMember[] = members.map((m) => ({
      id: m.id,
      employmentClass: m.employmentClass,
      isHelper: m.isHelper,
      isCounselor: m.jobLabel === "生活相談員",
      allowedSymbols: m.allowedSymbols,
      targetWorkDays: m.targetWorkDays,
      maxWorkDaysPerWeek: m.maxWorkDaysPerWeek,
    }));
    // 既存の希望休は維持する (設計書 §4)。
    const requestOff: Record<string, string[]> = {};
    for (const c of cells) {
      if (c.symbol === "REQUESTED_OFF") (requestOff[c.memberId] ??= []).push(c.date);
    }
    const result = generateRikaShifts(ym, genMembers, requestOff);
    setCells(result.cells);
    setWarnings(result.warnings);
  }

  function clearKeepRequests(): void {
    setCells((prev) => prev.filter((c) => c.symbol === "REQUESTED_OFF"));
    setWarnings([]);
  }

  /**
   * 希望休まとめ入力を反映する (設計書 §5)。
   * 指定された 職員 × 日 を希望休にし、その他のセルは触らない。
   * 反映後に自動生成すれば希望休は維持される。
   */
  function applyRequestOff(): void {
    const { requests, notes } = parseRequestOff(requestText, {
      ym,
      memberIds: members.map((m) => m.id),
    });
    setRequestNotes(notes);

    const targets: Array<{ memberId: string; date: string }> = [];
    for (const [memberId, dates] of Object.entries(requests)) {
      for (const date of dates) targets.push({ memberId, date });
    }
    setRequestApplied(targets.length);
    if (targets.length === 0) return;

    setCells((prev) => {
      const isTarget = new Set(targets.map((t) => `${t.memberId}|${t.date}`));
      const rest = prev.filter((c) => !isTarget.has(`${c.memberId}|${c.date}`));
      return [
        ...rest,
        ...targets.map((t) => ({
          memberId: t.memberId,
          date: t.date,
          symbol: "REQUESTED_OFF" as RikaSymbolCode,
        })),
      ];
    });
  }

  // ---- 保存 / 出力 (設計書 §6) ----

  /** 現在のグリッドを DB (Shift) に保存する。 */
  function saveToDb(): void {
    setSaveResult(null);
    startSaving(async () => {
      const result = await saveRikaShifts({
        ym,
        cells: cells.map((c) => ({
          memberId: c.memberId,
          date: c.date,
          symbol: c.symbol,
        })),
      });
      setSaveResult(result);
    });
  }

  /** グリッドを CSV (Excel で開ける) でダウンロードする。 */
  function downloadCsv(): void {
    const csv = buildRikaCsv({
      ym,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        employmentClass: m.employmentClass,
        jobLabel: m.jobLabel,
        isHelper: m.isHelper,
        targetWorkDays: m.targetWorkDays,
      })),
      days,
      cells,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `梨花シフト_${ym}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- 手修正 (設計書 §4) ----

  function setCellSymbol(memberId: string, date: string, symbol: RikaSymbolCode | null): void {
    setCells((prev) => {
      const rest = prev.filter((c) => !(c.memberId === memberId && c.date === date));
      return symbol ? [...rest, { memberId, date, symbol }] : rest;
    });
  }

  /** クリックでの循環順: 空 → 配置可能記号 → 公 → 有 → 希 → 空。 */
  function cycleCell(member: Member, date: string): void {
    const order: Array<RikaSymbolCode | null> = [
      null,
      ...member.allowedSymbols,
      "OFF",
      "PAID_LEAVE",
      "REQUESTED_OFF",
    ];
    const cur = cellByKey.get(`${member.id}|${date}`) ?? null;
    const idx = order.indexOf(cur);
    setCellSymbol(member.id, date, order[(idx + 1) % order.length]!);
  }

  /** ドラッグ&ドロップ: コマを別セルへ移動 (元は空、移動先は上書き)。 */
  function moveCell(
    srcMemberId: string,
    srcDate: string,
    dstMemberId: string,
    dstDate: string,
  ): void {
    if (srcMemberId === dstMemberId && srcDate === dstDate) return;
    const srcSym = cells.find((c) => c.memberId === srcMemberId && c.date === srcDate)?.symbol;
    if (!srcSym) return;
    setCells((prev) => {
      const rest = prev.filter(
        (c) =>
          !(c.memberId === srcMemberId && c.date === srcDate) &&
          !(c.memberId === dstMemberId && c.date === dstDate),
      );
      return [...rest, { memberId: dstMemberId, date: dstDate, symbol: srcSym }];
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 印刷時のみ出す見出し (画面では非表示)。 */}
      <h2 className="hidden text-lg font-bold text-slate-900 print:block">
        デイサービス梨花 シフト表 {ym}
      </h2>

      {/* 操作 + 月切り替え */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={autoGenerate}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          自動生成
        </button>
        <button
          type="button"
          onClick={clearKeepRequests}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          クリア (希望休だけ残す)
        </button>
        <button
          type="button"
          onClick={() => setRequestOpen((v) => !v)}
          aria-expanded={requestOpen}
          className={`rounded-md border px-3 py-2 text-sm ${
            requestOpen
              ? "border-pink-300 bg-pink-50 text-pink-800"
              : "border-slate-300 bg-white hover:bg-slate-50"
          }`}
        >
          希望休をまとめて入力 {requestOpen ? "▲" : "▼"}
        </button>
        <span className="mx-2 h-5 w-px bg-slate-200" />
        <a
          href={`/admin/shifts/rika?ym=${prevYm}`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          ← 前月
        </a>
        <span className="text-sm font-medium text-slate-700">{ym}</span>
        <a
          href={`/admin/shifts/rika?ym=${nextYm}`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          翌月 →
        </a>
        <span className="mx-2 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={saveToDb}
          disabled={saving || cells.length === 0}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "保存中…" : "DBに保存"}
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={cells.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          印刷
        </button>
      </div>

      <SaveResultPanel result={saveResult} memberName={memberName} />

      {requestOpen && (
        <RequestOffPanel
          text={requestText}
          onChange={setRequestText}
          onApply={applyRequestOff}
          notes={requestNotes}
          applied={requestApplied}
          memberName={memberName}
        />
      )}

      <WarningPanel warnings={warnings} memberName={memberName} />

      <p className="text-xs text-slate-500 print:hidden">
        セルを<strong>クリック</strong>すると勤務記号が循環します。勤務のコマは
        <strong>ドラッグ&amp;ドロップ</strong>
        で別の職員・日付へ移動できます。集計は即再計算されます。
      </p>

      {/* 凡例 */}
      <Legend />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-32 border-r border-b border-slate-200 bg-slate-50 px-2 py-2 text-left">
                職員
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={`min-w-9 border-b border-slate-200 px-1 py-1 ${
                    d.isBusinessDay ? "bg-slate-50" : "bg-slate-200/70"
                  }`}
                  title={d.holidayName ?? undefined}
                >
                  <div className="text-slate-700">{d.day}</div>
                  <div className={dowClass(d)}>{d.dowLabel}</div>
                </th>
              ))}
              <th className="min-w-16 border-b border-l border-slate-200 bg-slate-50 px-2 py-1">
                勤務
                <br />
                日数
              </th>
            </tr>
          </thead>

          <tbody>
            {members.map((m) => {
              const workdays = countWorkdays(cells, m.id);
              const overTarget =
                m.targetWorkDays != null && workdays !== m.targetWorkDays && workdays > 0;
              return (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <th className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white px-2 py-1 text-left">
                    <div className="font-medium text-slate-800">{m.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {m.employmentClass === "full" ? "正" : "パート"} / {m.jobLabel}
                      {m.isHelper ? " / 応援" : ""}
                    </div>
                  </th>
                  {days.map((d) => {
                    const sym = cellByKey.get(`${m.id}|${d.date}`) ?? null;
                    // 休業日 (水土日祝): 全員休み。「休」表示の固定セルとし、クリック/ドラッグで
                    // 中身だけ変わる誤操作を防ぐため編集不可にする (個人の公休「公」と区別)。
                    if (!d.isBusinessDay) {
                      return (
                        <td
                          key={d.date}
                          title="休業日"
                          className="h-9 border-b border-slate-100 bg-slate-200/70 text-slate-400 select-none"
                        >
                          休
                        </td>
                      );
                    }
                    return (
                      <td
                        key={d.date}
                        draggable={sym != null}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `${m.id}|${d.date}`);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const [sm, sd] = e.dataTransfer.getData("text/plain").split("|");
                          if (sm && sd) moveCell(sm, sd, m.id, d.date);
                        }}
                        onClick={() => cycleCell(m, d.date)}
                        title="クリックで記号変更 / ドラッグで移動"
                        className={`h-9 cursor-pointer border-b border-slate-100 select-none ${
                          sym ? symbolClass(sym) : "bg-white hover:bg-slate-100"
                        }`}
                      >
                        {sym ? symbolDef(sym).label : ""}
                      </td>
                    );
                  })}
                  <td
                    className={`border-b border-l border-slate-200 px-2 py-1 ${
                      overTarget ? "bg-red-100 font-semibold text-red-700" : "text-slate-700"
                    }`}
                  >
                    {workdays}
                    {m.targetWorkDays != null ? (
                      <span className="text-[10px] text-slate-400"> /{m.targetWorkDays}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* 集計行: 午前人数 / 午後人数 */}
          <tfoot>
            <AggregateRow
              label={`午前 (基準${RIKA_STAFFING.morning})`}
              days={days}
              cells={cells}
              pick="am"
            />
            <AggregateRow
              label={`午後 (基準${RIKA_STAFFING.afternoon})`}
              days={days}
              cells={cells}
              pick="pm"
            />
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AggregateRow({
  label,
  days,
  cells,
  pick,
}: {
  label: string;
  days: ReadonlyArray<RikaDay>;
  cells: ReadonlyArray<RikaCell>;
  pick: "am" | "pm";
}) {
  return (
    <tr>
      <th className="sticky left-0 z-10 border-t border-r border-slate-300 bg-slate-50 px-2 py-1 text-left font-medium text-slate-700">
        {label}
      </th>
      {days.map((d) => {
        if (!d.isBusinessDay) {
          return <td key={d.date} className="border-t border-slate-300 bg-slate-200/70" />;
        }
        const cov = dayCoverage(cells, d.date);
        const value = cov.counts[pick];
        const status = cov[pick];
        return (
          <td key={d.date} className={`border-t border-slate-300 ${coverageClass(status)}`}>
            {value}
          </td>
        );
      })}
      <td className="border-t border-l border-slate-300 bg-slate-50" />
    </tr>
  );
}

function WarningPanel({
  warnings,
  memberName,
}: {
  warnings: ReadonlyArray<RikaWarning>;
  memberName: ReadonlyMap<string, string>;
}) {
  if (warnings.length === 0) return null;
  const msg = (w: RikaWarning): string => {
    if (w.code === "UNDERSTAFFED") {
      const parts = [
        w.amShort > 0 ? `午前${w.amShort}名不足` : null,
        w.pmShort > 0 ? `午後${w.pmShort}名不足` : null,
      ].filter(Boolean);
      return `${w.date}: ${parts.join(" / ")}`;
    }
    if (w.code === "COUNSELOR_MISSING") {
      return `${w.date}: 相談員が不在 (必ず1名必要)`;
    }
    if (w.code === "TARGET_UNREACHED") {
      return `${memberName.get(w.memberId) ?? w.memberId}: 勤務日数 ${w.assigned}日 (目安 ${w.target}日に未達)`;
    }
    return `${memberName.get(w.memberId) ?? w.memberId}: 希望休 ${w.requested}日 (枠 ${w.quota}日を超過)`;
  };
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
      <p className="font-semibold">確認事項 ({warnings.length}件)</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.map((w, i) => (
          <li key={i}>{msg(w)}</li>
        ))}
      </ul>
    </div>
  );
}

/** DB 保存の結果表示 (成功件数 / 保存できなかった職員)。 */
function SaveResultPanel({
  result,
  memberName,
}: {
  result: RikaSaveResult | null;
  memberName: ReadonlyMap<string, string>;
}) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 print:hidden">
        保存に失敗しました: {result.error}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 print:hidden">
      <p className="font-semibold">
        {result.saved}件のシフトを保存しました (勤務表 /admin/shifts に反映されます)。
      </p>
      {result.skipped.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
          {result.skipped.map((s) => (
            <li key={s.memberId}>
              {memberName.get(s.memberId) ?? s.memberId}: {s.reason} (保存対象外)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 希望休 注記 1 件を現場向けの日本語に整形する。 */
function requestNoteMessage(n: RikaRequestNote, memberName: ReadonlyMap<string, string>): string {
  const who = (id: string) => memberName.get(id) ?? id;
  switch (n.kind) {
    case "UNKNOWN_MEMBER":
      return `${n.line}行目: 「${n.text}」に該当する職員が見つかりません`;
    case "AMBIGUOUS_MEMBER":
      return `${n.line}行目: 「${n.text}」は複数名 (${n.matches.join("・")}) に当てはまります。フルネームで指定してください`;
    case "INVALID_DATE":
      return `${n.line}行目 ${who(n.memberId)}: 「${n.raw}」は日付として読めません (1〜31 か YYYY-MM-DD)`;
    case "NON_BUSINESS_DAY":
      return `${n.line}行目 ${who(n.memberId)}: ${n.date} は休業日のため希望休は不要です (採用しません)`;
    case "DUPLICATE":
      return `${n.line}行目 ${who(n.memberId)}: ${n.date} が重複しています (1回だけ採用)`;
    case "NO_DATES":
      return `${n.line}行目: 「${n.text}」に日付の指定がありません`;
  }
}

/** 希望休まとめ入力パネル (設計書 §5)。CSV 貼り付け / 手入力 共通。 */
function RequestOffPanel({
  text,
  onChange,
  onApply,
  notes,
  applied,
  memberName,
}: {
  text: string;
  onChange: (v: string) => void;
  onApply: () => void;
  notes: ReadonlyArray<RikaRequestNote>;
  applied: number | null;
  memberName: ReadonlyMap<string, string>;
}) {
  return (
    <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-3 print:hidden">
      <p className="text-sm font-semibold text-pink-900">希望休をまとめて入力</p>
      <p className="mt-1 text-xs text-slate-600">
        1 行に <strong>氏名 + 希望休の日</strong> を書いてください。紙で集めた希望休を
        そのまま貼り付け / 手打ちできます。区切りは空白・カンマ・コロン (全角可)。 日は{" "}
        <strong>日にちの数字</strong> でも <strong>2025-12-08</strong> でも構いません。
      </p>
      <pre className="mt-1 rounded bg-white/70 px-2 py-1 text-[11px] text-slate-500">
        {"五木田秀美 5 12 19\n菅原知美, 3, 10\n益子：2025-12-08、2025-12-15"}
      </pre>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="氏名 日 日 日 …"
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500"
        >
          反映
        </button>
        {applied != null && (
          <span className="text-xs text-slate-600">
            {applied}件の希望休を反映しました
            {notes.length > 0 ? `（注意 ${notes.length}件）` : ""}
            。続けて「自動生成」すると維持されます。
          </span>
        )}
      </div>
      {notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 rounded-md border border-amber-300 bg-amber-50 p-2 pl-6 text-xs text-amber-900">
          {notes.map((n, i) => (
            <li key={i}>{requestNoteMessage(n, memberName)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Legend() {
  const items: Array<{ label: string; cls: string; char?: string }> = [
    { label: "終日系 (日勤/梨3-5)", cls: "bg-green-200" },
    { label: "午前 (半日F/梨2)", cls: "bg-lime-100" },
    { label: "午後 (半午)", cls: "bg-orange-200" },
    { label: "公休 (個人の休み)", cls: "bg-slate-200 text-slate-500", char: "公" },
    { label: "有休", cls: "bg-sky-200" },
    { label: "希望休", cls: "bg-pink-200" },
    {
      label: "休業日 (事業所が休み)",
      cls: "bg-slate-200/70 border border-slate-300 text-slate-400",
      char: "休",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 print:hidden">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-semibold ${it.cls}`}
          >
            {it.char ?? ""}
          </span>
          {it.label}
        </span>
      ))}
      <span className="ml-2 text-slate-400">
        集計: 不足=
        <span className="text-red-600">赤</span> / 充足=
        <span className="text-green-600">緑</span> / 余剰=
        <span className="text-blue-600">青</span>
      </span>
    </div>
  );
}
