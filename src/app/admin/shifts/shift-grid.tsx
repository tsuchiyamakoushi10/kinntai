"use client";

import type {
  DayKind,
  EmploymentType,
  ShiftKind,
  ShiftPreferenceStatus,
  ShiftPreferenceType,
} from "@prisma/client";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  SHIFT_PREFERENCE_STATUS_LABELS,
  SHIFT_PREFERENCE_TYPE_LABELS,
} from "@/lib/employee-labels";
import {
  computeDayShortfalls,
  type CoverageNeed,
  type DayShortfall,
  type GridCell,
} from "@/lib/shift/grid-coverage";
import type { ShiftCell } from "@/lib/shifts/diff";

import { saveShifts } from "./actions";

/** 勤務表に重ねて表示する「従業員が出した希望」1 件分。 */
export type PreferenceMark = {
  employeeId: string;
  /** `YYYY-MM-DD` */
  workDate: string;
  preferenceType: ShiftPreferenceType;
  status: ShiftPreferenceStatus;
};

/**
 * 希望種別ごとのセル表示 (短縮ラベル + 色)。
 * 申請があるセルは「セル全体」をこの色で塗る (配置済みでも) ので、点ではなく見やすい。
 */
const PREF_VISUAL: Record<ShiftPreferenceType, { short: string; bg: string; text: string }> = {
  REQUESTED_OFF: { short: "希休", bg: "bg-pink-300", text: "text-pink-900" },
  PAID_LEAVE: { short: "有給", bg: "bg-amber-300", text: "text-amber-900" },
  PREFERRED_NIGHT: { short: "夜希", bg: "bg-indigo-300", text: "text-indigo-900" },
  UNAVAILABLE: { short: "不可", bg: "bg-rose-300", text: "text-rose-900" },
};

function prefTitle(p: PreferenceMark): string {
  return `${SHIFT_PREFERENCE_TYPE_LABELS[p.preferenceType]}（${SHIFT_PREFERENCE_STATUS_LABELS[p.status]}）の申請`;
}

/** 不足の内訳を「午前-1・午後-2・相談員(午前)」のような短い文にする。 */
function shortfallText(s: DayShortfall): string {
  const parts: string[] = [];
  if (s.am) parts.push(`午前-${s.am}`);
  if (s.pm) parts.push(`午後-${s.pm}`);
  if (s.earlyAm) parts.push(`送迎-${s.earlyAm}`);
  if (s.nightIn) parts.push(`夜入-${s.nightIn}`);
  if (s.nightOut) parts.push(`夜明-${s.nightOut}`);
  if (s.counselorAm) parts.push("相談員(午前)");
  if (s.counselorPm) parts.push("相談員(午後)");
  if (s.nurseAm) parts.push("看護師(午前)");
  if (s.nursePm) parts.push("看護師(午後)");
  return parts.join("・");
}

/** "2026-06-03" → "6/3(火)"。 */
function shortDateWithWeekday(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  const w = d.getUTCDay();
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[w]})`;
}

export type EmployeeRow = {
  id: string;
  code: string;
  name: string;
  kana: string;
  // CSV 取り込み後は空欄あり。表示・並び順以外で参照しない。
  employmentType: EmploymentType | null;
};

export type PatternOption = {
  id: string;
  code: string;
  name: string;
  shiftKind: ShiftKind;
  color: string;
  paidLeaveUnits: number;
  /** 午前/午後の在席カウント (不足アラート計算用)。 */
  amCount: number;
  pmCount: number;
  /** 送迎 (8:15開始) か (送迎不足アラート用)。 */
  isEarly: boolean;
};

type Props = {
  officeId: string;
  ym: string;
  /** `YYYY-MM-DD` 当月日リスト */
  days: ReadonlyArray<string>;
  employees: ReadonlyArray<EmployeeRow>;
  patterns: ReadonlyArray<PatternOption>;
  initialCells: ReadonlyArray<ShiftCell>;
  /** 前月コピー用。officeId が一致する前月分のセル。 */
  prevMonthCells: ReadonlyArray<ShiftCell>;
  /** 自動作成由来の (employeeId:workDate) 集合。初期表示時の識別マーク用。 */
  autoCellKeys?: ReadonlySet<string>;
  /** 従業員が出した希望 (希望休 / 有給 など)。勤務表に色とラベルで重ねて表示する。 */
  preferences?: ReadonlyArray<PreferenceMark>;
  /** 日種ごとの配置基準 (午前/午後/相談員/夜勤の必要数)。渡すと下部に不足アラートを出す。 */
  coverageDemands?: Partial<Record<DayKind, CoverageNeed>>;
  /** days と同じ並びの日種。不足計算に使う。 */
  dayKinds?: ReadonlyArray<DayKind>;
  /** 生活相談員の従業員 ID。相談員不足の判定に使う。 */
  counselorEmployeeIds?: ReadonlySet<string>;
  /** 看護師(看護職員)の従業員 ID。看護師不足の判定に使う。 */
  nurseEmployeeIds?: ReadonlySet<string>;
  /** 閲覧専用モード (ALL 閲覧で使う)。パレット / 保存 / 編集 UI を全部隠す。 */
  readOnly?: boolean;
};

type CellMap = Map<string, ShiftCell>;

function cellKey(employeeId: string, workDate: string): string {
  return `${employeeId}:${workDate}`;
}

function toCellMap(cells: ReadonlyArray<ShiftCell>): CellMap {
  const m: CellMap = new Map();
  for (const c of cells) m.set(cellKey(c.employeeId, c.workDate), c);
  return m;
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"] as const;

function weekdayOf(ymd: string): number {
  // JST はサーバとブラウザで一致するよう UTC 0 時で評価
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
}

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "正",
  PART_TIME_INSURED: "パ保",
  PART_TIME_UNINSURED: "パ",
};

/**
 * 月次勤務表のグリッド本体。クライアント状態でドラフトを保持し、保存時に
 * 差分を Server Action に送る。
 */
export function ShiftGrid({
  officeId,
  ym,
  days,
  employees,
  patterns,
  initialCells,
  prevMonthCells,
  autoCellKeys,
  preferences,
  coverageDemands,
  dayKinds,
  counselorEmployeeIds,
  nurseEmployeeIds,
  readOnly = false,
}: Props) {
  const [cells, setCells] = useState<CellMap>(() => toCellMap(initialCells));
  const initialKey = useMemo(() => JSON.stringify(initialCells), [initialCells]);
  const currentKey = useMemo(() => {
    const arr = Array.from(cells.values()).sort((a, b) => {
      const ek = a.employeeId.localeCompare(b.employeeId);
      return ek !== 0 ? ek : a.workDate.localeCompare(b.workDate);
    });
    return JSON.stringify(arr);
  }, [cells]);
  const isDirty = initialKey !== currentKey;

  const [activePatternId, setActivePatternId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ employeeIdx: number; dayIdx: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement | null>(null);

  const patternsById = useMemo(() => {
    const m = new Map<string, PatternOption>();
    for (const p of patterns) m.set(p.id, p);
    return m;
  }, [patterns]);

  // (employeeId:workDate) → 希望。却下済みは呼び出し側で除外して渡す想定。
  const prefByCell = useMemo(() => {
    const m = new Map<string, PreferenceMark>();
    for (const p of preferences ?? []) m.set(cellKey(p.employeeId, p.workDate), p);
    return m;
  }, [preferences]);

  // 現在の配置から日ごとのスタッフ不足を計算 (セル編集のたびに再計算)。
  const shortfalls = useMemo(() => {
    if (!coverageDemands || !dayKinds) return [];
    const daysWithKind = days.map((date, i) => ({ date, dayKind: dayKinds[i] ?? "WEEKDAY" }));
    const cellsByDate = new Map<string, GridCell[]>();
    for (const c of cells.values()) {
      const pattern = patternsById.get(c.shiftPatternId);
      if (!pattern) continue;
      const arr = cellsByDate.get(c.workDate) ?? [];
      arr.push({
        amCount: pattern.amCount,
        pmCount: pattern.pmCount,
        isNightIn: pattern.shiftKind === "NIGHT_IN",
        isNightOut: pattern.shiftKind === "NIGHT_OUT",
        isCounselor: counselorEmployeeIds?.has(c.employeeId) ?? false,
        isNurse: nurseEmployeeIds?.has(c.employeeId) ?? false,
        isEarly: pattern.isEarly,
      });
      cellsByDate.set(c.workDate, arr);
    }
    return computeDayShortfalls(daysWithKind, coverageDemands, cellsByDate);
  }, [
    cells,
    coverageDemands,
    dayKinds,
    days,
    patternsById,
    counselorEmployeeIds,
    nurseEmployeeIds,
  ]);

  function paintCell(employeeIdx: number, dayIdx: number): void {
    const emp = employees[employeeIdx];
    const day = days[dayIdx];
    if (!emp || !day) return;
    if (!activePatternId) {
      // パレット未選択ならカーソル移動だけ
      setCursor({ employeeIdx, dayIdx });
      return;
    }
    setCursor({ employeeIdx, dayIdx });
    setCells((prev) => {
      const next = new Map(prev);
      next.set(cellKey(emp.id, day), {
        employeeId: emp.id,
        workDate: day,
        shiftPatternId: activePatternId,
        note: null,
      });
      return next;
    });
  }

  function clearCell(employeeIdx: number, dayIdx: number): void {
    const emp = employees[employeeIdx];
    const day = days[dayIdx];
    if (!emp || !day) return;
    setCells((prev) => {
      const k = cellKey(emp.id, day);
      if (!prev.has(k)) return prev;
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  }

  function moveCursor(de: number, dd: number): void {
    setCursor((cur) => {
      const base = cur ?? { employeeIdx: 0, dayIdx: 0 };
      const e = Math.max(0, Math.min(employees.length - 1, base.employeeIdx + de));
      const d = Math.max(0, Math.min(days.length - 1, base.dayIdx + dd));
      return { employeeIdx: e, dayIdx: d };
    });
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLDivElement>): void {
    if (readOnly) return;
    if (!cursor) return;
    switch (ev.key) {
      case "ArrowLeft":
        ev.preventDefault();
        moveCursor(0, -1);
        break;
      case "ArrowRight":
        ev.preventDefault();
        moveCursor(0, 1);
        break;
      case "ArrowUp":
        ev.preventDefault();
        moveCursor(-1, 0);
        break;
      case "ArrowDown":
        ev.preventDefault();
        moveCursor(1, 0);
        break;
      case "Backspace":
      case "Delete":
        ev.preventDefault();
        clearCell(cursor.employeeIdx, cursor.dayIdx);
        break;
      case "Enter":
        ev.preventDefault();
        if (activePatternId) paintCell(cursor.employeeIdx, cursor.dayIdx);
        break;
    }
  }

  function copyFromPrevMonth(): void {
    if (prevMonthCells.length === 0) {
      setMessage({ kind: "err", text: "前月の勤務表がありません。" });
      return;
    }
    // 利用可能なパターン (当月の patterns) に含まれるものだけコピー
    const validPatternIds = new Set(patterns.map((p) => p.id));
    const prevByEmpDay = new Map<string, ShiftCell>();
    for (const c of prevMonthCells) {
      // 前月日付の "日" 部分だけ取り出して、当月の同じ日に対応させる
      const dom = c.workDate.slice(-2);
      const targetDate = `${ym}-${dom}`;
      // 当月にその日が存在しない (例: 2/30) ものはスキップ
      if (!days.includes(targetDate)) continue;
      if (!validPatternIds.has(c.shiftPatternId)) continue;
      prevByEmpDay.set(cellKey(c.employeeId, targetDate), {
        employeeId: c.employeeId,
        workDate: targetDate,
        shiftPatternId: c.shiftPatternId,
        note: c.note,
      });
    }
    // 空セルだけ埋める
    setCells((prev) => {
      const next = new Map(prev);
      let added = 0;
      for (const [k, v] of prevByEmpDay) {
        if (!next.has(k)) {
          next.set(k, v);
          added += 1;
        }
      }
      if (added === 0) {
        setMessage({ kind: "err", text: "コピー対象の空セルがありませんでした。" });
      } else {
        setMessage({ kind: "ok", text: `前月から ${added} 件コピーしました (保存はまだです)。` });
      }
      return next;
    });
  }

  function clearAll(): void {
    setCells(new Map());
    setMessage({ kind: "ok", text: `すべて消去しました (保存はまだです)。` });
  }

  function resetToInitial(): void {
    setCells(toCellMap(initialCells));
    setMessage(null);
  }

  function onSave(): void {
    startTransition(async () => {
      const res = await saveShifts({
        officeId,
        ym,
        cells: Array.from(cells.values()),
      });
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `保存しました (追加・更新 ${res.upserted} 件 / 削除 ${res.deleted} 件)。`,
        });
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* パレット (閲覧専用では非表示) */}
      {!readOnly && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">
              シフトパターンを選んでセルをクリックで貼り付け
            </span>
            {activePatternId && (
              <button
                type="button"
                onClick={() => setActivePatternId(null)}
                className="text-xs text-slate-600 underline hover:text-slate-900"
              >
                選択解除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {patterns.map((p) => {
              const active = p.id === activePatternId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePatternId(active ? null : p.id)}
                  className={[
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                    active
                      ? "border-slate-900 ring-2 ring-slate-900/30"
                      : "border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                  aria-pressed={active}
                  title={`${p.name} (${p.code})`}
                >
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-sm"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="font-medium text-slate-900">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ツールバー (閲覧専用では非表示) */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyFromPrevMonth}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            前月コピー (空セルのみ)
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            全クリア
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={resetToInitial}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              変更を破棄
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {message && (
              <span
                className={
                  message.kind === "ok" ? "text-sm text-emerald-700" : "text-sm text-rose-700"
                }
                role="status"
              >
                {message.text}
              </span>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "保存中…" : isDirty ? "保存" : "変更なし"}
            </button>
          </div>
        </div>
      )}

      {/* 希望 (申請) の凡例。preferences が渡されたときだけ表示。 */}
      {preferences && preferences.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium">従業員の希望:</span>
          {(Object.keys(PREF_VISUAL) as ShiftPreferenceType[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className={`inline-block size-3 rounded-sm ${PREF_VISUAL[t].bg}`} />
              {SHIFT_PREFERENCE_TYPE_LABELS[t]}
            </span>
          ))}
          <span className="text-slate-400">（セル全体の色で表示。点線枠＝承認待ち）</span>
        </div>
      )}

      {/* グリッド */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="overflow-auto rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-slate-900/20 focus:outline-none"
      >
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 min-w-44 border-r border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">
                氏名
              </th>
              {days.map((d) => {
                const dom = Number(d.slice(-2));
                const w = weekdayOf(d);
                const weekend = w === 0 || w === 6;
                return (
                  <th
                    key={d}
                    className={[
                      "min-w-9 border-b border-slate-200 px-1 py-1 text-center font-medium",
                      weekend
                        ? w === 0
                          ? "bg-rose-50 text-rose-700"
                          : "bg-sky-50 text-sky-700"
                        : "text-slate-600",
                    ].join(" ")}
                  >
                    <div className="leading-none">{dom}</div>
                    <div className="text-[10px] leading-tight">{WEEKDAY[w]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, ei) => (
              <tr key={emp.id} className="border-b border-slate-100">
                <th
                  className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-left align-middle font-normal"
                  scope="row"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900">{emp.name}</span>
                    <span className="rounded-sm bg-slate-100 px-1 text-[10px] text-slate-600">
                      {emp.employmentType ? EMPLOYMENT_LABEL[emp.employmentType] : "—"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {emp.kana}
                    <span className="ml-1 font-mono text-slate-400">{emp.code}</span>
                  </div>
                </th>
                {days.map((d, di) => {
                  const k = cellKey(emp.id, d);
                  const cell = cells.get(k);
                  const pattern = cell ? patternsById.get(cell.shiftPatternId) : null;
                  const pref = prefByCell.get(k) ?? null;
                  const visual = pref ? PREF_VISUAL[pref.preferenceType] : null;
                  const isCursor = cursor?.employeeIdx === ei && cursor?.dayIdx === di;
                  const w = weekdayOf(d);
                  const weekend = w === 0 || w === 6;
                  const isAuto = autoCellKeys?.has(k) ?? false;
                  // 出勤=色付き+太字で目立たせ、公休=淡いグレーで引っ込めて、休/出勤を一目で分ける。
                  const kind = pattern?.shiftKind;
                  const isOff = kind === "OFF";
                  const isWork = kind === "WORK" || kind === "NIGHT_IN" || kind === "NIGHT_OUT";
                  return (
                    <td
                      key={d}
                      className={[
                        "relative h-9 border-r border-slate-100 p-0 text-center align-middle",
                        readOnly ? "" : "cursor-pointer hover:ring-2 hover:ring-slate-400/50",
                        weekend && !pattern && !pref ? "bg-slate-50/60" : "",
                        // 公休は淡いグレー (引っ込ませる)。申請セルはクラス側の色を優先。
                        !pref && isOff ? "bg-slate-100" : "",
                        visual ? visual.bg : "",
                        pref?.status === "PENDING"
                          ? "outline-1 -outline-offset-2 outline-slate-500 outline-dashed"
                          : "",
                        isCursor && !readOnly ? "ring-2 ring-slate-900 ring-inset" : "",
                      ].join(" ")}
                      style={
                        // 申請・公休はクラス側で色付け。出勤は濃いめ(50%)、その他の休(有休等)は淡め(35%)。
                        pattern && !pref && !isOff
                          ? { backgroundColor: pattern.color + (isWork ? "80" : "59") }
                          : undefined
                      }
                      onClick={() => {
                        if (readOnly) return;
                        gridRef.current?.focus();
                        paintCell(ei, di);
                      }}
                      title={[
                        pattern
                          ? `${pattern.name} (${pattern.code})${isAuto ? " ・自動作成由来" : ""}`
                          : "",
                        pref ? prefTitle(pref) : "",
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    >
                      {pattern ? (
                        <span
                          className={[
                            "block truncate px-0.5 text-[11px]",
                            isOff
                              ? "font-normal text-slate-400"
                              : isWork
                                ? "font-bold text-slate-900"
                                : "font-medium text-slate-900",
                          ].join(" ")}
                        >
                          {pattern.name}
                        </span>
                      ) : visual ? (
                        <span
                          className={`block truncate px-0.5 text-[11px] font-bold ${visual.text}`}
                        >
                          {visual.short}
                        </span>
                      ) : (
                        <span className="block text-slate-300">·</span>
                      )}
                      {isAuto && pattern && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute bottom-0 left-0.5 text-[8px] leading-none text-slate-600"
                          title="自動作成由来"
                        >
                          ▾
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スタッフ不足アラート (配置基準が渡されたときだけ表示)。セル編集に追従。 */}
      {coverageDemands &&
        (shortfalls.length === 0 ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            スタッフの不足はありません ✓
          </div>
        ) : (
          <div
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <p className="font-semibold">
              スタッフが足りない日があります（{shortfalls.length} 日）
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {shortfalls.map((s) => (
                <li key={s.date}>
                  <span className="font-medium">{shortDateWithWeekday(s.date)}</span>{" "}
                  <span className="text-rose-700">{shortfallText(s)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-rose-700">
              （−N＝その時間帯の在席が N 名不足。相談員は午前/午後それぞれ必要数に届かない日）
            </p>
          </div>
        ))}

      {!readOnly && (
        <p className="text-xs text-slate-500">
          矢印キーで移動、Backspace / Delete で消去、Enter で貼り付け。前月コピーは
          当月の空セルのみ埋めます。
        </p>
      )}
    </div>
  );
}
