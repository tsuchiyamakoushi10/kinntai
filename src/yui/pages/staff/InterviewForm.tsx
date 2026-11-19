"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@/yui/router";
import { Save, Heart, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/yui/auth";
import { staffInterviewStore, managerInterviewStore, periodStore, uid } from "@/yui/storage";
import type { StaffInterview } from "../../types";
import PageHeader from "../../components/PageHeader";

interface FormState {
  effort: string;
  trouble: string;
  growth: string;
  vision: string;
  proposal: string;
}

const EMPTY: FormState = {
  effort: "",
  trouble: "",
  growth: "",
  vision: "",
  proposal: "",
};

interface Question {
  key: keyof FormState;
  label: string;
  hint: string;
  placeholder: string;
  required: boolean;
}

const QUESTIONS: Question[] = [
  {
    key: "effort",
    label: "この半年で頑張ったこと・できるようになったこと",
    hint: "大きなことでなくて大丈夫です。自分なりに頑張ったこと、以前よりできるようになったことを教えてください。",
    placeholder: "例：新しく入った職員さんへの声かけを意識して増やしました。",
    required: true,
  },
  {
    key: "trouble",
    label: "仕事の中で困っていること・気になっていること",
    hint: "業務のことでも、人との関わりでも構いません。うまく言葉にできなくても、「相談したい」だけでも大丈夫です。",
    placeholder: "例：記録業務に時間がかかってしまうことがあります。",
    required: true,
  },
  {
    key: "growth",
    label: "これから伸ばしたいこと・やってみたいこと",
    hint: "身につけたいこと、学びたいこと、挑戦してみたいことなど、自由に書いてください。",
    placeholder: "例：認知症ケアについてもっと学びたい。",
    required: true,
  },
  {
    key: "vision",
    label: "半年後、どうなっていたいですか？",
    hint: "仕事のことでも、自分自身のことでも構いません。半年後、こんなふうになっていたいと思う姿を教えてください。",
    placeholder: "例：リーダー業務の一部を任されるくらいになっていたい。",
    required: true,
  },
  {
    key: "proposal",
    label: "会社や管理者に伝えておきたいこと（任意）",
    hint: "相談したいこと、挑戦するために手伝ってほしいこと、職場への提案など、何でも構いません。",
    placeholder: "例：研修案内をもう少し早めにいただけると助かります。",
    required: false,
  },
];

export default function InterviewForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const period = periodStore.active();
  const periodKey = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");

  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<StaffInterview | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  useEffect(() => {
    if (!user || !periodKey) return;
    const found = staffInterviewStore.byStaffAndPeriod(user.id, periodKey);
    if (found) {
      setExisting(found);
      setForm({
        effort: found.effort,
        trouble: found.trouble,
        growth: found.growth,
        vision: found.vision,
        proposal: found.proposal,
      });
    }
  }, [user, periodKey]);

  if (!user || !period) return null;

  const onChange = (key: keyof FormState, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    setSaved(false);
  };

  const allRequiredFilled = QUESTIONS.filter((q) => q.required).every(
    (q) => form[q.key].trim().length > 0,
  );

  const submit = () => {
    const now = new Date().toISOString();
    const item: StaffInterview = existing
      ? { ...existing, ...form, submittedAt: now }
      : {
          id: uid("si"),
          staffId: user.id,
          period: periodKey,
          submittedAt: now,
          ...form,
        };
    staffInterviewStore.upsert(item);

    // 管理者面談レコードを作る（無ければ）
    if (!managerInterviewStore.byStaffAndPeriod(user.id, periodKey) && user.managerId) {
      managerInterviewStore.upsert({
        id: uid("mi"),
        staffInterviewId: item.id,
        staffId: user.id,
        managerId: user.managerId,
        period: periodKey,
        interviewedAt: null,
        strength: "",
        issue: "",
        expectation: "",
        followUp: "",
        evaluation: {
          rinen: null,
          taiou: null,
          team: null,
          shutai: null,
          sekinin: null,
        },
        status: "in_progress",
      });
    }

    setExisting(item);
    setSaved(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <PageHeader title="面談シート" subtitle={`${period.label} ／ ${user.name}さん`} />

      <div className="card bg-warm-50 border-warm-100 mb-6">
        <div className="flex items-start gap-3">
          <Heart className="text-warm-500 mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-ink-600 text-sm leading-relaxed">
            このシートは、評価のためではなく、
            <strong className="text-ink-800">あなたを理解し、支えるため</strong>のものです。
            <br />
            完璧な文章でなくて大丈夫です。あなたの言葉で、ありのまま書いてください。
          </div>
        </div>
      </div>

      {saved && (
        <div className="card bg-sage-50 border-sage-100 mb-6">
          <div className="text-sage-600 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">保存しました。ありがとうございました。</span>
          </div>
          <div className="text-ink-600 mt-2 text-sm">管理者面談の日時は、別途お知らせします。</div>
        </div>
      )}

      <div className="space-y-5">
        {QUESTIONS.map((q, i) => (
          <div key={q.key} className="card">
            <label className="block">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-warm-500 font-bold">Q{i + 1}.</span>
                <span className="text-ink-800 font-bold">{q.label}</span>
                {!q.required && <span className="text-ink-400 text-xs">（任意）</span>}
              </div>
              <p className="text-ink-400 mb-3 text-xs leading-relaxed">{q.hint}</p>
              <textarea
                className="input-base min-h-[110px] resize-y leading-relaxed"
                placeholder={q.placeholder}
                value={form[q.key]}
                onChange={(e) => onChange(q.key, e.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      {confirmPending ? (
        <div className="card bg-warm-50 border-warm-200 mt-6">
          <p className="text-ink-800 mb-1 text-sm font-bold">
            この内容で面談シートを提出しますか？
          </p>
          <p className="text-ink-400 mb-4 text-xs">提出後も、面談前であれば内容を修正できます。</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => setConfirmPending(false)} className="btn-secondary flex-1">
              戻って確認する
            </button>
            <button
              onClick={() => {
                setConfirmPending(false);
                submit();
              }}
              className="btn-primary flex-1"
            >
              <Save className="h-4 w-4" />
              はい、提出します
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center justify-end gap-3 sm:flex-row">
          {!allRequiredFilled && (
            <span className="text-ink-400 text-xs">必須項目を入力すると保存できます</span>
          )}
          <button onClick={() => navigate("/staff/home")} className="btn-secondary">
            ホームへ戻る
          </button>
          <button
            onClick={() => setConfirmPending(true)}
            disabled={!allRequiredFilled}
            className="btn-primary"
          >
            <Save className="h-4 w-4" />
            {existing ? "内容を修正する" : "面談シートを提出する"}
          </button>
        </div>
      )}
    </>
  );
}
