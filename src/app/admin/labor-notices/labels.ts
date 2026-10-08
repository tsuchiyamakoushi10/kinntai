import type { LaborNoticeStatus, LaborNoticeType } from "@prisma/client";

export const TYPE_LABEL: Record<LaborNoticeType, string> = {
  FULL_TIME: "正社員",
  PART_TIME: "パート",
  NIGHT_ONLY: "夜勤専従",
};

export const STATUS_LABEL: Record<LaborNoticeStatus, string> = {
  DRAFT: "下書き",
  ISSUED: "発行済み（署名待ち）",
  SIGNED: "署名済み",
  VOID: "無効",
};
