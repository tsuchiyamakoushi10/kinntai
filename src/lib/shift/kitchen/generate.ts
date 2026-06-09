/**
 * 厨房 (KITCHEN) 月次シフト 自動生成 (固定ロスター方式 / B案)。
 *
 * 厨房記号 (厨房A/B/C) は午前/午後カウント 0/0 で「配置基準 (午前◯名・午後◯名) モデル」
 * に乗らない (docs/auto-shift-design-v2.md §10.1)。需要は「1 日に厨房◯記号を◯人」という
 * パターン×人数で、これは梨花と同じ固定ロスター方式が素直。少人数 (3 名) を日々の必要枠へ
 * 公平に割り当て、余った人を公休にする。
 *
 * 流れ (完璧な解は狙わない。組む→過不足を見る→人が直す):
 *   - 各営業日、その日の必要記号 (config) を、入れる人 (希望休/連勤でない) に
 *     「累計勤務が少ない人 優先」で割り当てる (公平ローテ)。
 *   - 余った人は公休。人員が足りなければ不足として可視化。
 *
 * DB に触れない純粋関数。決定論: 同じ入力なら同じ結果 (employeeCode で安定ソート)。
 */
import type { DayKind } from "@prisma/client";

/** 当月の 1 日ぶん。 */
export type KitchenDay = {
  /** "YYYY-MM-DD" */
  date: string;
  dayKind: DayKind;
};

/** 厨房の割当に渡す職員。 */
export type KitchenEmployee = {
  id: string;
  /** 安定ソート用 (決定論)。 */
  employeeCode: string;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外をまとめて渡す。 */
  unavailableDates: ReadonlySet<string>;
};

export type KitchenConfig = {
  maxConsecutiveDays: number;
  /** 公休の記号 (例: 公休)。 */
  offSymbol: string;
  /**
   * 日種ごとに必要な厨房記号 (順序 = 割当の優先順。例: ["厨房A","厨房B"])。
   * 空配列 / 未定義の日種は休業 (全員公休)。
   */
  demandByDayKind: Partial<Record<DayKind, ReadonlyArray<string>>>;
};

export type KitchenAssignment = {
  employeeId: string;
  date: string;
  baseSymbol: string;
};

/** 1 日の結果 (過不足の可視化用)。 */
export type KitchenDayResult = {
  date: string;
  dayKind: DayKind;
  operating: boolean;
  /** その日の必要人数。 */
  required: number;
  /** 実際に置けた人数。 */
  filled: number;
  /** 不足人数 (required - filled, 下限 0)。 */
  shortfall: number;
};

export type GenerateKitchenResult = {
  /** 全職員 × 全日 のセル (勤務 or 公休)。 */
  assignments: KitchenAssignment[];
  days: KitchenDayResult[];
  /** 職員ごとの出勤日数 (公休除く)。 */
  workDaysByEmployee: Record<string, number>;
};

export type GenerateKitchenInput = {
  days: ReadonlyArray<KitchenDay>;
  employees: ReadonlyArray<KitchenEmployee>;
  config: KitchenConfig;
};

export function generateKitchen(input: GenerateKitchenInput): GenerateKitchenResult {
  const { config } = input;
  const employees = [...input.employees].sort((a, b) =>
    a.employeeCode.localeCompare(b.employeeCode),
  );

  const workDays = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const consecutive = new Map<string, number>(employees.map((e) => [e.id, 0]));

  const assignments: KitchenAssignment[] = [];
  const dayResults: KitchenDayResult[] = [];

  for (const day of input.days) {
    const demand = config.demandByDayKind[day.dayKind] ?? [];
    const operating = demand.length > 0;
    const today = new Map<string, string>(); // employeeId -> 記号

    if (operating) {
      // 入れる人 (不可日でない / 連勤上限内) を、累計勤務が少ない順に並べて必要枠へ。
      const eligible = employees
        .filter(
          (e) =>
            !e.unavailableDates.has(day.date) && consecutive.get(e.id)! < config.maxConsecutiveDays,
        )
        .sort((a, b) => {
          const wa = workDays.get(a.id)!;
          const wb = workDays.get(b.id)!;
          if (wa !== wb) return wa - wb;
          const ca = consecutive.get(a.id)!;
          const cb = consecutive.get(b.id)!;
          if (ca !== cb) return ca - cb;
          return a.employeeCode.localeCompare(b.employeeCode);
        });

      for (let i = 0; i < demand.length && i < eligible.length; i++) {
        today.set(eligible[i]!.id, demand[i]!);
      }
    }

    // セル出力 + 状態更新。勤務した人は出勤+連勤++、それ以外は公休で連勤リセット。
    for (const e of employees) {
      const work = today.get(e.id);
      if (work) {
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: work });
        workDays.set(e.id, workDays.get(e.id)! + 1);
        consecutive.set(e.id, consecutive.get(e.id)! + 1);
      } else {
        assignments.push({ employeeId: e.id, date: day.date, baseSymbol: config.offSymbol });
        consecutive.set(e.id, 0);
      }
    }

    const filled = today.size;
    const required = demand.length;
    dayResults.push({
      date: day.date,
      dayKind: day.dayKind,
      operating,
      required,
      filled,
      shortfall: Math.max(0, required - filled),
    });
  }

  return {
    assignments,
    days: dayResults,
    workDaysByEmployee: Object.fromEntries(workDays),
  };
}
