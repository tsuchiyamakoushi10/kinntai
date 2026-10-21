/**
 * DB の行を画面用の型にする (管理画面・職員画面で共通)。
 */
import type { TrainingSurveyMaterial, TrainingSurveyQuestion } from "@prisma/client";

import type { QuestionConfig, SurveyQuestion } from "./logic";
import type { SurveyMaterial } from "./materials";

export function toSurveyQuestion(q: TrainingSurveyQuestion): SurveyQuestion {
  return {
    id: q.id,
    kind: q.kind,
    label: q.label,
    description: q.description ?? "",
    options: q.options,
    config: (q.config as QuestionConfig | null) ?? {},
    required: q.required,
  };
}

export function toSurveyMaterial(m: TrainingSurveyMaterial): SurveyMaterial {
  return {
    id: m.id,
    kind: m.kind,
    title: m.title,
    url: m.url ?? "",
    storageKey: m.storageKey ?? "",
    fileName: m.fileName ?? "",
    mimeType: m.mimeType ?? "",
    sizeBytes: m.sizeBytes ?? 0,
    mustView: m.mustView,
  };
}
