"use client";

/**
 * 結いナビのデータ保存層 (元: services/storage.ts の localStorage 版) を CrossShift の DB 版に差し替えたもの。
 *
 * 画面のコードは「同期で読む・同期で書く」前提なので、関数の形は元のまま残す。
 * - 読む: 画面を開いたときにサーバーから受け取った「見てよい範囲のデータ」(YuiSnapshot) をメモリから返す
 * - 書く: メモリをすぐ書き換え、裏でサーバーへ保存する (サーバー側で権限を毎回確かめる)
 * 保存に失敗したときはお知らせを出して画面を読み直す (メモリと DB のずれを残さない)。
 */
import type {
  Staff,
  StaffInterview,
  ManagerInterview,
  PresidentReview,
  Period,
  GrowthExpectation,
  GrowthPath,
  HRAssessment,
} from "./types";
import type { YuiKind, YuiSnapshot } from "@/lib/yui/types";
import { saveYuiItem } from "@/lib/yui/actions";

let db: YuiSnapshot = {
  meId: "",
  staff: [],
  staffInterviews: [],
  managerInterviews: [],
  presidentReviews: [],
  periods: [],
  growthExpectations: [],
  growthPaths: [],
  hrAssessments: [],
};

export function initYuiStore(snapshot: YuiSnapshot) {
  db = structuredClone(snapshot);
}

let queue: Promise<unknown> = Promise.resolve();
let failed = false;

function persist(kind: YuiKind, item: unknown) {
  queue = queue.then(async () => {
    if (failed) return;
    try {
      const res = await saveYuiItem(kind, item);
      if (!res.ok) throw new Error(res.error);
    } catch (e) {
      failed = true;
      const msg = e instanceof Error && e.message ? e.message : "通信できませんでした";
      window.alert(`保存できませんでした。\n${msg}\n\n画面を読み直します。`);
      window.location.reload();
    }
  });
}

function upsertIn<T extends { id: string }>(list: T[], item: T) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
}

// 結いナビの呼び出し (uid('mi') など) をそのまま使うため引数は残す。DB の ID に使うので UUID にする
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function uid(_prefix = "id"): string {
  return crypto.randomUUID();
}

// ====== 職員 ======
export const staffStore = {
  list: () => [...db.staff],
  get: (id: string) => db.staff.find((s) => s.id === id) ?? null,
  upsert: (staff: Staff) => {
    upsertIn(db.staff, staff);
    persist("staff", staff);
  },
};

// ====== 職員面談 ======
export const staffInterviewStore = {
  list: () => [...db.staffInterviews],
  byStaff: (staffId: string) => db.staffInterviews.filter((i) => i.staffId === staffId),
  byStaffAndPeriod: (staffId: string, period: string) =>
    db.staffInterviews.find((i) => i.staffId === staffId && i.period === period) ?? null,
  get: (id: string) => db.staffInterviews.find((i) => i.id === id) ?? null,
  upsert: (item: StaffInterview) => {
    upsertIn(db.staffInterviews, item);
    persist("staffInterview", item);
  },
};

// ====== 管理者面談 ======
export const managerInterviewStore = {
  list: () => [...db.managerInterviews],
  byStaff: (staffId: string) => db.managerInterviews.filter((i) => i.staffId === staffId),
  byStaffAndPeriod: (staffId: string, period: string) =>
    db.managerInterviews.find((i) => i.staffId === staffId && i.period === period) ?? null,
  byPeriod: (period: string) => db.managerInterviews.filter((i) => i.period === period),
  upsert: (item: ManagerInterview) => {
    upsertIn(db.managerInterviews, item);
    persist("managerInterview", item);
  },
};

// ====== 社長確認 ======
export const presidentReviewStore = {
  list: () => [...db.presidentReviews],
  byStaffAndPeriod: (staffId: string, period: string) =>
    db.presidentReviews.find((r) => r.staffId === staffId && r.period === period) ?? null,
  byPeriod: (period: string) => db.presidentReviews.filter((r) => r.period === period),
  upsert: (item: PresidentReview) => {
    upsertIn(db.presidentReviews, item);
    persist("presidentReview", item);
  },
};

// ====== 期間 ======
export const periodStore = {
  list: () => [...db.periods],
  active: () => db.periods.find((p) => p.active) ?? db.periods[0] ?? null,
  upsert: (period: Period) => {
    // 「いまの期間」は 1 つだけ (サーバー側でも同じように直す)
    if (period.active) db.periods.forEach((p) => (p.active = false));
    upsertIn(db.periods, period);
    persist("period", period);
  },
};

// ====== 今期の期待 ======
export const growthExpectationStore = {
  list: () => [...db.growthExpectations],
  byStaffAndPeriod: (staffId: string, period: string) =>
    db.growthExpectations.find((g) => g.staffId === staffId && g.period === period) ?? null,
  upsert: (item: GrowthExpectation) => {
    upsertIn(db.growthExpectations, item);
    persist("growthExpectation", item);
  },
};

// ====== 成長ステージ（GrowthPath） ======
export const growthPathStore = {
  list: () => [...db.growthPaths],
  byStaff: (staffId: string) => db.growthPaths.find((g) => g.staffId === staffId) ?? null,
  upsert: (item: GrowthPath) => {
    upsertIn(db.growthPaths, item);
    persist("growthPath", item);
  },
};

// ====== 人事考課 ======
export const hrAssessmentStore = {
  list: () => [...db.hrAssessments],
  byStaffAndPeriod: (staffId: string, period: string) =>
    db.hrAssessments.find((h) => h.staffId === staffId && h.period === period) ?? null,
  byPeriod: (period: string) => db.hrAssessments.filter((h) => h.period === period),
  upsert: (item: HRAssessment) => {
    upsertIn(db.hrAssessments, item);
    persist("hrAssessment", item);
  },
};

/** ログイン中の人 (結いナビの Staff の形) */
export function currentStaff(): Staff | null {
  return db.staff.find((s) => s.id === db.meId) ?? null;
}
