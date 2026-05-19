"use client";

import type { EmploymentType, ShiftKind } from "@prisma/client";
import { useMemo, useRef, useState, useTransition } from "react";

import type { ShiftCell } from "@/lib/shifts/diff";

import { saveShifts } from "./actions";

export type EmployeeRow = {
  id: string;
  code: string;
  name: string;
  kana: string;
  employmentType: EmploymentType;
};

export type PatternOption = {
  id: string;
  code: string;
  name: string;
  shiftKind: ShiftKind;
  color: string;
  paidLeaveUnits: number;
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
  CONTRACT: "契",
  PART_TIME: "パ",
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
      {/* パレット */}
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

      {/* ツールバー */}
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
                      {EMPLOYMENT_LABEL[emp.employmentType]}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {emp.kana}
                    <span className="ml-1 font-mono text-slate-400">{emp.code}</span>
                  </div>
                </th>
                {days.map((d, di) => {
                  const cell = cells.get(cellKey(emp.id, d));
                  const pattern = cell ? patternsById.get(cell.shiftPatternId) : null;
                  const isCursor = cursor?.employeeIdx === ei && cursor?.dayIdx === di;
                  const w = weekdayOf(d);
                  const weekend = w === 0 || w === 6;
                  return (
                    <td
                      key={d}
                      className={[
                        "h-9 cursor-pointer border-r border-slate-100 p-0 text-center align-middle hover:ring-2 hover:ring-slate-400/50",
                        weekend && !pattern ? "bg-slate-50/60" : "",
                        isCursor ? "ring-2 ring-slate-900 ring-inset" : "",
                      ].join(" ")}
                      style={
                        pattern
                          ? { backgroundColor: pattern.color + "33" /* 20% alpha */ }
                          : undefined
                      }
                      onClick={() => {
                        gridRef.current?.focus();
                        paintCell(ei, di);
                      }}
                      title={pattern ? `${pattern.name} (${pattern.code})` : ""}
                    >
                      {pattern ? (
                        <span className="block truncate px-0.5 text-[11px] font-medium text-slate-900">
                          {pattern.name}
                        </span>
                      ) : (
                        <span className="block text-slate-300">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        矢印キーで移動、Backspace / Delete で消去、Enter で貼り付け。前月コピーは
        当月の空セルのみ埋めます。
      </p>
    </div>
  );
}
