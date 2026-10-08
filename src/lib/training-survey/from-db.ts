/**
 * DB の質問行を SurveyQuestion にする (管理画面・職員画面で共通)。
 */
import type { TrainingSurveyQuestion } from "@prisma/client";

import type { QuestionConfig, SurveyQuestion } from "./logic";

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
