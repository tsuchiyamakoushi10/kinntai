/**
 * 梨花シフトの自動生成 (設計書 §3 の貪欲法)。
 *
 * 方針 (設計書 §0): 完全自動を目指さない。「一旦自動で組む → 過不足を可視化 →
 * 人間が直す」前提。完璧な解でなくてよい。
 *
 * 配置順 (設計書 §3):
 *   1. 常勤の正社員を先に配置 (終日系優先で配置基準を埋める。目安勤務日数に向け極力勤務)。
 *   2. 不足枠をパート + 兼務応援で補充 (個人制約: 益子=半日F午前のみ / 木下=半午午後のみ 等)。
 *   3. 余った人はその日は公休。休業日 (水土日祝) は全員公休。
 *   - 希望休は維持し、連勤上限 (6 日) を超えない。
 *
 * 兼務者 (横野・木下) は「梨花に来る人」として扱い (設計書 §7)、Tier1 では自分の
 * 目安を埋めにいかず、Tier2 で不足補充にのみ使う。
 *
 * 本モジュールは DB / React に依存しない純粋関数。同じ入力 → 同じ出力 (決定論的)。
 */
import {
  RIKA_COUNSELOR_REQUIRED,
  RIKA_MAX_CONSECUTIVE_DAYS,
  RIKA_REQUEST_OFF_QUOTA,
  RIKA_STAFFING,
  symbolDef,
  type RikaSymbolCode,
} from "./config";
import { buildRikaMonth, type RikaCell } from "./grid";

export type RikaGenMember = {
  id: string;
  employmentClass: "full" | "part";
  isHelper: boolean;
  /** 生活相談員か (営業日は必ず 1 名必要)。 */
  isCounselor: boolean;
  /** 配置可能な勤務記号 (休み系を除く勤務記号)。 */
  allowedSymbols: ReadonlyArray<RikaSymbolCode>;
  /** 月間勤務日数の目安 (正社員のみ。null = 目安なし)。 */
  targetWorkDays: number | null;
  /** 週あたりの勤務日数の上限 (null = 上限なし)。 */
  maxWorkDaysPerWeek: number | null;
};

/** その日が属する週 (月曜) を返す。週次上限の判定キー。 */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const diff = (d.getUTCDay() + 6) % 7; // 月曜からの経過日数
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** memberId -> 希望休の日付 ("YYYY-MM-DD")。 */
export type RikaRequestOffMap = Readonly<Record<string, ReadonlyArray<string>>>;

export type RikaWarning =
  | { code: "UNDERSTAFFED"; date: string; amShort: number; pmShort: number }
  | { code: "COUNSELOR_MISSING"; date: string }
  | { code: "TARGET_UNREACHED"; memberId: string; target: number; assigned: number }
  | { code: "REQUEST_OFF_OVER_QUOTA"; memberId: string; quota: number; requested: number };

export type RikaGenResult = {
  /** 全 職員 × 全日 のセル (公休・希望休も含む)。 */
  cells: RikaCell[];
  warnings: RikaWarning[];
};

type Need = { am: number; pm: number };

/**
 * 残り必要数 need に対して member の配置可能記号から最良の 1 つを選ぶ。
 * gain (= need を満たす寄与) 最大、同点なら overshoot (総コマ数) 最小を選ぶ。
 */
function chooseSymbol(
  member: RikaGenMember,
  need: Need,
): { code: RikaSymbolCode; gain: number } | null {
  let best: RikaSymbolCode | null = null;
  let bestGain = -1;
  let bestTotal = Number.POSITIVE_INFINITY;
  for (const code of member.allowedSymbols) {
    const s = symbolDef(code);
    if (s.isOff) continue;
    const gain = (s.am && need.am > 0 ? 1 : 0) + (s.pm && need.pm > 0 ? 1 : 0);
    const total = s.am + s.pm;
    if (gain > bestGain || (gain === bestGain && total < bestTotal)) {
      best = code;
      bestGain = gain;
      bestTotal = total;
    }
  }
  return best == null ? null : { code: best, gain: bestGain };
}

function applyGain(need: Need, code: RikaSymbolCode): void {
  const s = symbolDef(code);
  if (s.am) need.am = Math.max(0, need.am - 1);
  if (s.pm) need.pm = Math.max(0, need.pm - 1);
}

export function generateRikaShifts(
  ym: string,
  members: ReadonlyArray<RikaGenMember>,
  requestOff: RikaRequestOffMap = {},
): RikaGenResult {
  const days = buildRikaMonth(ym);
  const cells: RikaCell[] = [];
  const warnings: RikaWarning[] = [];

  // 希望休 (日付) を集合化。
  const reqOffSet = new Map<string, Set<string>>();
  for (const m of members) reqOffSet.set(m.id, new Set(requestOff[m.id] ?? []));

  // 実働日数の累計と、連勤判定用の「直前まで何日連続勤務か」。
  const workCount = new Map<string, number>(members.map((m) => [m.id, 0]));
  const consec = new Map<string, number>(members.map((m) => [m.id, 0]));
  // 週次勤務日数 (memberId|月曜日 → 日数)。週あたり上限の判定に使う。
  const weekWork = new Map<string, number>();

  const isResidentFull = (m: RikaGenMember): boolean => m.employmentClass === "full" && !m.isHelper;

  for (const day of days) {
    // 休業日: 全員公休。連勤はリセット。
    if (!day.isBusinessDay) {
      for (const m of members) {
        cells.push({ memberId: m.id, date: day.date, symbol: "OFF" });
        consec.set(m.id, 0);
      }
      continue;
    }

    const need: Need = { am: RIKA_STAFFING.morning, pm: RIKA_STAFFING.afternoon };
    const assignedToday = new Set<string>();
    let counselorWorkedToday = false;

    // 希望休の人は希望休セルを置き、配置候補から除外。
    const candidates: RikaGenMember[] = [];
    for (const m of members) {
      if (reqOffSet.get(m.id)!.has(day.date)) {
        cells.push({ memberId: m.id, date: day.date, symbol: "REQUESTED_OFF" });
        assignedToday.add(m.id);
        consec.set(m.id, 0);
        continue;
      }
      // 連勤上限に達している人は配置しない (この後 公休)。
      if ((consec.get(m.id) ?? 0) >= RIKA_MAX_CONSECUTIVE_DAYS) continue;
      // 週あたり上限に達している人も配置しない (例: 週1勤務)。
      if (
        m.maxWorkDaysPerWeek != null &&
        (weekWork.get(`${m.id}|${mondayOf(day.date)}`) ?? 0) >= m.maxWorkDaysPerWeek
      ) {
        continue;
      }
      candidates.push(m);
    }

    const place = (m: RikaGenMember, code: RikaSymbolCode): void => {
      cells.push({ memberId: m.id, date: day.date, symbol: code });
      assignedToday.add(m.id);
      applyGain(need, code);
      workCount.set(m.id, (workCount.get(m.id) ?? 0) + 1);
      consec.set(m.id, (consec.get(m.id) ?? 0) + 1);
      const wk = `${m.id}|${mondayOf(day.date)}`;
      weekWork.set(wk, (weekWork.get(wk) ?? 0) + 1);
      if (m.isCounselor) counselorWorkedToday = true;
    };

    // ---- Tier1: 常勤の正社員を先に配置 (相談員優先・終日系優先、目安に向けて極力勤務) ----
    const tier1 = candidates
      .filter(isResidentFull)
      .sort(
        (a, b) =>
          Number(b.isCounselor) - Number(a.isCounselor) ||
          workCount.get(a.id)! - workCount.get(b.id)! ||
          a.id.localeCompare(b.id),
      );
    for (const m of tier1) {
      const pick = chooseSymbol(m, need);
      if (pick) place(m, pick.code); // gain 0 でも常勤は勤務させる (目安日数のため)
    }

    // ---- Tier2: パート + 兼務応援で不足枠を補充 ----
    // 非応援を先に、勤務日数が少ない人を優先 (負荷分散)。決定論のため id で安定化。
    const tier2 = candidates
      .filter((m) => !isResidentFull(m) && !assignedToday.has(m.id))
      .sort(
        (a, b) =>
          Number(a.isHelper) - Number(b.isHelper) ||
          workCount.get(a.id)! - workCount.get(b.id)! ||
          a.id.localeCompare(b.id),
      );
    for (const m of tier2) {
      if (need.am <= 0 && need.pm <= 0) break;
      const pick = chooseSymbol(m, need);
      if (pick && pick.gain > 0) place(m, pick.code);
    }

    // ---- 相談員フロア: 営業日は必ず相談員を 1 名確保する ----
    // 梨花の相談員は五木田 1 名のみ。Tier1 で常勤相談員は毎営業日入るが、週上限などの軟制約で
    // 外れたり、将来パート相談員が gain0 で Tier2 に置かれない場合に備え、相談員が 0 名なら 1 名出す。
    // 希望休・連勤上限 (ハード制約) の相談員は対象外 → その日は下の COUNSELOR_MISSING で警告。
    if (RIKA_COUNSELOR_REQUIRED > 0 && !counselorWorkedToday) {
      const counselorPool = members
        .filter(
          (m) =>
            m.isCounselor &&
            !assignedToday.has(m.id) &&
            !reqOffSet.get(m.id)!.has(day.date) &&
            (consec.get(m.id) ?? 0) < RIKA_MAX_CONSECUTIVE_DAYS,
        )
        .sort(
          (a, b) =>
            Number(a.isHelper) - Number(b.isHelper) ||
            workCount.get(a.id)! - workCount.get(b.id)! ||
            a.id.localeCompare(b.id),
        );
      for (const m of counselorPool) {
        const pick = chooseSymbol(m, need);
        if (pick) {
          place(m, pick.code); // gain 0 でも相談員確保のため勤務させる
          break;
        }
      }
    }

    // ---- 余った候補は公休。連勤はリセット ----
    for (const m of members) {
      if (assignedToday.has(m.id)) continue;
      cells.push({ memberId: m.id, date: day.date, symbol: "OFF" });
      consec.set(m.id, 0);
    }

    // ---- 当日の不足を警告 ----
    if (need.am > 0 || need.pm > 0) {
      warnings.push({
        code: "UNDERSTAFFED",
        date: day.date,
        amShort: need.am,
        pmShort: need.pm,
      });
    }
    // 相談員が営業日に 1 名も勤務していない (全相談員が希望休/連勤上限など)。
    if (!counselorWorkedToday) {
      warnings.push({ code: "COUNSELOR_MISSING", date: day.date });
    }
  }

  // ---- 月間の警告: 目安勤務日数の未達 / 希望休枠超過 ----
  for (const m of members) {
    if (m.targetWorkDays != null) {
      const assigned = workCount.get(m.id)!;
      if (assigned < m.targetWorkDays) {
        warnings.push({
          code: "TARGET_UNREACHED",
          memberId: m.id,
          target: m.targetWorkDays,
          assigned,
        });
      }
    }
    const requested = reqOffSet.get(m.id)!.size;
    const quota =
      m.employmentClass === "full"
        ? RIKA_REQUEST_OFF_QUOTA.fullTime
        : RIKA_REQUEST_OFF_QUOTA.partTime;
    if (requested > quota) {
      warnings.push({
        code: "REQUEST_OFF_OVER_QUOTA",
        memberId: m.id,
        quota,
        requested,
      });
    }
  }

  return { cells, warnings };
}
