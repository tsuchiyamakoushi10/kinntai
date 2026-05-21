/**
 * 拠点シフト枠 (office_shift_quotas) の雛形シード。
 *
 * 用途:
 *   開発環境で S-A-27 と S-A-26 自動作成を触ったとき、各拠点に最低限の
 *   必要人員数が入っている状態を作るための雛形。実データは現場ヒアリング
 *   で確定する。
 *
 * 設計:
 *   - docs/shift-patterns.md §1 の規模 (拠点 × 人数 × 24h 稼働有無) を元に
 *     「最低限これだけは要る」レベルの数字を入れる
 *   - 24h 稼働拠点 (NRS-CENTER / SHO-CENTER) は早 / 日勤 / 遅 / 夜入 / 夜明
 *   - デイ拠点 (DAY-CENTER / DAY-RIKKA) は平日中心、土曜は半数、日祝は閉所 (0)
 *   - KITCHEN は厨房A/B/C を毎日 (土日祝も給食提供あり前提)
 *   - 全拠点共通の有償系パターン (EARLY, DAY, LATE, NIGHT_IN, NIGHT_OUT) は
 *     利用拠点のみに quota を入れる (= 該当 office_id を持つ pattern と組む)
 *
 * 後で S-A-27 から数字をいじっても、再シードで上書きされて困らないよう
 * upsert (office_id, shift_pattern_id, day_kind) で運用する。
 */
import { DayKind, PrismaClient } from "@prisma/client";

/** quota の数値: [weekday, saturday, sunday_holiday] */
type DayKindCounts = readonly [number, number, number];

/** 拠点コード × シフトパターンコード × 必要人員数 (平日 / 土 / 日祝) */
const QUOTA_TEMPLATE: ReadonlyArray<{
  officeCode: string;
  patternCode: string;
  counts: DayKindCounts;
}> = [
  // ===== NRS-CENTER ナーシングホーム (24h, 10 名規模) =====
  { officeCode: "NRS-CENTER", patternCode: "EARLY", counts: [1, 1, 1] },
  { officeCode: "NRS-CENTER", patternCode: "DAY", counts: [2, 1, 1] },
  { officeCode: "NRS-CENTER", patternCode: "LATE", counts: [1, 1, 1] },
  { officeCode: "NRS-CENTER", patternCode: "NIGHT_IN", counts: [1, 1, 1] },
  { officeCode: "NRS-CENTER", patternCode: "NIGHT_OUT", counts: [1, 1, 1] },

  // ===== SHO-CENTER ショートステイ (24h, 15 名規模) =====
  { officeCode: "SHO-CENTER", patternCode: "EARLY", counts: [1, 1, 1] },
  { officeCode: "SHO-CENTER", patternCode: "DAY_SHORT", counts: [3, 2, 2] },
  { officeCode: "SHO-CENTER", patternCode: "LATE", counts: [1, 1, 1] },
  { officeCode: "SHO-CENTER", patternCode: "NIGHT_IN", counts: [1, 1, 1] },
  { officeCode: "SHO-CENTER", patternCode: "NIGHT_OUT", counts: [1, 1, 1] },
  { officeCode: "SHO-CENTER", patternCode: "SC_A", counts: [1, 0, 0] },

  // ===== DAY-CENTER デイサービス結いの心 (平日中心, 10 名規模) =====
  { officeCode: "DAY-CENTER", patternCode: "DAY_CARE", counts: [4, 2, 0] },
  { officeCode: "DAY-CENTER", patternCode: "DC_A", counts: [1, 0, 0] },
  { officeCode: "DAY-CENTER", patternCode: "DC_B", counts: [1, 0, 0] },
  { officeCode: "DAY-CENTER", patternCode: "DC_C", counts: [1, 0, 0] },

  // ===== DAY-RIKKA デイサービス梨花 (平日中心, 10 名規模) =====
  { officeCode: "DAY-RIKKA", patternCode: "DAY_CARE", counts: [3, 2, 0] },
  { officeCode: "DAY-RIKKA", patternCode: "RK_1", counts: [1, 0, 0] },
  { officeCode: "DAY-RIKKA", patternCode: "RK_2", counts: [1, 0, 0] },

  // ===== KITCHEN 厨房 (給食提供は毎日, 10 名規模) =====
  { officeCode: "KITCHEN", patternCode: "KT_A", counts: [2, 1, 1] },
  { officeCode: "KITCHEN", patternCode: "KT_B", counts: [2, 1, 1] },
  { officeCode: "KITCHEN", patternCode: "KT_C", counts: [1, 1, 1] },
];

const DAY_KINDS: ReadonlyArray<DayKind> = [
  DayKind.WEEKDAY,
  DayKind.SATURDAY,
  DayKind.SUNDAY_HOLIDAY,
];

export async function seedOfficeShiftQuotas(
  prisma: PrismaClient,
  officeIds: ReadonlyMap<string, string>,
): Promise<number> {
  // pattern code -> id を 1 度だけ引いてキャッシュ
  const patterns = await prisma.shiftPattern.findMany({
    select: { id: true, code: true },
  });
  const patternIds = new Map(patterns.map((p) => [p.code, p.id] as const));

  let upserted = 0;
  for (const t of QUOTA_TEMPLATE) {
    const officeId = officeIds.get(t.officeCode);
    if (!officeId) {
      throw new Error(`quota refers to unknown office: ${t.officeCode}`);
    }
    const patternId = patternIds.get(t.patternCode);
    if (!patternId) {
      throw new Error(`quota refers to unknown pattern: ${t.patternCode}`);
    }

    for (let i = 0; i < DAY_KINDS.length; i += 1) {
      const dayKind = DAY_KINDS[i]!;
      const requiredCount = t.counts[i]!;
      await prisma.officeShiftQuota.upsert({
        where: {
          officeId_shiftPatternId_dayKind: {
            officeId,
            shiftPatternId: patternId,
            dayKind,
          },
        },
        update: { requiredCount },
        create: { officeId, shiftPatternId: patternId, dayKind, requiredCount },
      });
      upserted += 1;
    }
  }
  return upserted;
}
