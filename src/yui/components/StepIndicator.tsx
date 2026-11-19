"use client";

import { Check, FileText, MessageCircle, ClipboardCheck, Sparkles } from "lucide-react";

export type StepNumber = 1 | 2 | 3 | 4;

interface Props {
  current: StepNumber;
}

const STEPS = [
  { num: 1 as StepNumber, label: "シート入力", icon: FileText },
  { num: 2 as StepNumber, label: "管理者面談", icon: MessageCircle },
  { num: 3 as StepNumber, label: "社長確認", icon: ClipboardCheck },
  { num: 4 as StepNumber, label: "今期完了", icon: Sparkles },
];

export default function StepIndicator({ current }: Props) {
  return (
    <div className="card mb-6 p-5">
      <div className="text-warm-500 mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.2em]">
        <Sparkles className="h-3.5 w-3.5" />
        GROWTH FLOW ／ 今期の流れ
      </div>
      <div className="flex items-stretch">
        {STEPS.map((step, idx) => {
          const state = step.num < current ? "done" : step.num === current ? "current" : "future";
          const Icon = step.icon;
          const isLast = idx === STEPS.length - 1;
          return (
            <div key={step.num} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition md:h-11 md:w-11 ${
                    state === "done"
                      ? "bg-sage-500 border-sage-500 text-white"
                      : state === "current"
                        ? "bg-warm-500 border-warm-500 shadow-soft ring-warm-100 text-white ring-4"
                        : "border-cream-200 text-ink-400 bg-white"
                  }`}
                >
                  {state === "done" ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </div>
                <div className="mt-2 w-full min-w-0 text-center">
                  <div
                    className={`text-[10px] font-bold md:text-xs ${
                      state === "current"
                        ? "text-warm-600"
                        : state === "done"
                          ? "text-sage-600"
                          : "text-ink-400"
                    }`}
                  >
                    STEP {step.num}
                  </div>
                  <div
                    className={`text-[11px] leading-tight md:text-sm ${
                      state === "current"
                        ? "text-ink-800 font-bold"
                        : state === "done"
                          ? "text-ink-600"
                          : "text-ink-400"
                    }`}
                  >
                    {step.label}
                  </div>
                  {state === "current" && (
                    <div className="text-warm-500 mt-0.5 text-[10px] font-bold">← いま</div>
                  )}
                </div>
              </div>
              {!isLast && (
                <div
                  className={`mx-0 mt-5 h-0.5 flex-1 md:mt-[22px] ${
                    step.num < current ? "bg-sage-300" : "bg-cream-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function calculateStep(
  hasStaffInterview: boolean,
  managerStatus: "not_started" | "in_progress" | "done" | null,
  presidentStatus: "pending" | "confirmed" | null,
): StepNumber {
  if (!hasStaffInterview) return 1;
  if (managerStatus !== "done") return 2;
  if (presidentStatus !== "confirmed") return 3;
  return 4;
}
