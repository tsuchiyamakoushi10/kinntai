/**
 * 厨房 (KITCHEN) のシフト自動生成 設定。
 *
 * 梨花 (rika/config.ts) と同じく、事業所固有のルール (稼働日・必要記号・連勤上限) を
 * コードに直書きせず設定として集約する。厨房は配置基準 (午前/午後) モデルに乗らないため
 * 専用の固定ロスター生成 (generateKitchen) を使う。
 *
 * 運用ルール (オーナー確認 2026-06-09):
 *   - 毎日稼働 (土日祝も。入居者の食事は毎日)。
 *   - 1 日 2 名 (厨房A + 厨房B)。厨房職員 3 名で公休を回す (各自 月 10 日前後の公休)。
 *   - 厨房C は当面未使用。短時間が要る日に使う場合はここの記号を差し替える。
 */
import type { DayKind } from "@prisma/client";

import type { KitchenConfig } from "./generate";

/** 厨房拠点の Office.code。 */
export const KITCHEN_OFFICE_CODE = "KITCHEN";

/** 1 日に必要な厨房記号 (順序 = 割当の優先順)。 */
const KITCHEN_DAILY_PATTERNS: ReadonlyArray<string> = ["厨房A", "厨房B"];

/** 毎日稼働なので全日種に同じ需要を当てる (休業日なし)。 */
const KITCHEN_DEMAND_BY_DAY_KIND: Partial<Record<DayKind, ReadonlyArray<string>>> = {
  WEEKDAY: KITCHEN_DAILY_PATTERNS,
  SATURDAY: KITCHEN_DAILY_PATTERNS,
  SUNDAY_HOLIDAY: KITCHEN_DAILY_PATTERNS,
};

export const KITCHEN_CONFIG: KitchenConfig = {
  maxConsecutiveDays: 6,
  offSymbol: "公休",
  demandByDayKind: KITCHEN_DEMAND_BY_DAY_KIND,
};
