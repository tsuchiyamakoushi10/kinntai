import type { TrainingSurveyStatus } from "@prisma/client";

export const SURVEY_STATUS_LABEL: Record<TrainingSurveyStatus, string> = {
  DRAFT: "下書き",
  OPEN: "回答受付中",
  CLOSED: "締め切り",
};

export const SURVEY_STATUS_CLASS: Record<TrainingSurveyStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  OPEN: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-600",
};
