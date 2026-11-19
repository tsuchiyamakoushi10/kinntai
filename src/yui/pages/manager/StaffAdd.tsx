"use client";

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@/yui/router";
import {
  UserPlus,
  Save,
  CheckCircle2,
  ArrowLeft,
  Briefcase,
  IdCard,
  GraduationCap,
  Sparkles,
  NotebookPen,
  Building2,
} from "lucide-react";
import { useAuth } from "@/yui/auth";
import { staffStore, uid } from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import type {
  Staff,
  Department,
  JobType,
  EmploymentType,
  EmploymentStatus,
  Qualification,
  GrowthStep,
} from "../../types";
import {
  JOB_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  QUALIFICATION_OPTIONS,
  GROWTH_STEP_OPTIONS,
  SECONDARY_DEPARTMENT_OPTIONS,
} from "../../types";

interface FormState {
  kinjiroCode: string;
  name: string;
  furigana: string;
  jobType: JobType | "";
  secondaryDepartments: Department[];
  employmentType: EmploymentType | "";
  joinedAt: string;
  employmentStatus: EmploymentStatus;
  returnDate: string;
  retirementDate: string;
  qualifications: Qualification[];
  growthStep: GrowthStep | "";
  managerMemo: string;
}

const initialForm: FormState = {
  kinjiroCode: "",
  name: "",
  furigana: "",
  jobType: "",
  secondaryDepartments: [],
  employmentType: "",
  joinedAt: "",
  employmentStatus: "在籍中",
  returnDate: "",
  retirementDate: "",
  qualifications: [],
  growthStep: "",
  managerMemo: "",
};

export default function StaffAdd() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [savedStaff, setSavedStaff] = useState<Staff | null>(null);

  const needsReturnDate = form.employmentStatus === "産休・育休中";
  const needsRetirementDate =
    form.employmentStatus === "退職予定" || form.employmentStatus === "退職済";

  const managerName = user?.name ?? "";
  const department = (user?.department ?? "本部") as Department;

  const toggleSecondary = (d: Department) => {
    setForm((f) => ({
      ...f,
      secondaryDepartments: f.secondaryDepartments.includes(d)
        ? f.secondaryDepartments.filter((x) => x !== d)
        : [...f.secondaryDepartments, d],
    }));
  };

  const toggleQualification = (q: Qualification) => {
    setForm((f) => ({
      ...f,
      qualifications: f.qualifications.includes(q)
        ? f.qualifications.filter((x) => x !== q)
        : [...f.qualifications, q],
    }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.kinjiroCode.trim()) next.kinjiroCode = "勤次郎コードを入力してください";
    if (!form.name.trim()) next.name = "氏名を入力してください";
    if (!form.furigana.trim()) next.furigana = "フリガナを入力してください";
    if (!form.jobType) next.jobType = "主職種を選択してください";
    if (!form.employmentType) next.employmentType = "雇用形態を選択してください";
    if (!form.joinedAt) next.joinedAt = "入社日を入力してください";
    if (needsReturnDate && !form.returnDate) next.returnDate = "復帰予定日を入力してください";
    if (needsRetirementDate && !form.retirementDate)
      next.retirementDate = "退職日を入力してください";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!user) return;
    if (!validate()) {
      // 最初のエラー要素までスクロール
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const staff: Staff = {
      id: uid("user_staff"),
      name: form.name.trim(),
      furigana: form.furigana.trim(),
      kinjiroCode: form.kinjiroCode.trim(),
      department,
      secondaryDepartments:
        form.secondaryDepartments.length > 0 ? form.secondaryDepartments : undefined,
      jobType: form.jobType as JobType,
      joinedAt: form.joinedAt,
      employmentType: form.employmentType as EmploymentType,
      employmentStatus: form.employmentStatus,
      returnDate: needsReturnDate ? form.returnDate : null,
      retirementDate: needsRetirementDate ? form.retirementDate : null,
      qualifications: form.qualifications.length > 0 ? form.qualifications : undefined,
      growthStep: form.growthStep || undefined,
      managerMemo: form.managerMemo.trim() || undefined,
      role: "staff",
      managerId: user.id,
      active: form.employmentStatus !== "退職済",
    };
    staffStore.upsert(staff);
    setSavedStaff(staff);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddAnother = () => {
    setForm(initialForm);
    setErrors({});
    setSavedStaff(null);
  };

  return (
    <>
      <PageHeader
        title="職員追加"
        subtitle={`${user?.department ?? ""} に新しい職員を登録します`}
        right={
          <Link
            to="/manager/staff-list"
            className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
          </Link>
        }
      />

      {savedStaff && (
        <div className="card bg-sage-50 border-sage-200 mb-6">
          <div className="flex items-start gap-3">
            <div className="bg-sage-500 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sage-700 text-sm font-bold">保存しました</div>
              <div className="text-ink-800 mt-0.5">
                <span className="font-medium">{savedStaff.name}</span> さん（
                {savedStaff.jobType}）を {savedStaff.department} に登録しました。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/manager/staff-list")}
                  className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition"
                >
                  職員一覧へ
                </button>
                <button
                  type="button"
                  onClick={handleAddAnother}
                  className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
                >
                  <UserPlus className="h-4 w-4" />
                  続けて追加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!savedStaff && Object.keys(errors).length > 0 && (
        <div className="card mb-6 border-orange-200 bg-orange-50">
          <div className="text-sm font-bold text-orange-700">未入力の項目があります</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-orange-700">
            {Object.values(errors).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={savedStaff ? "pointer-events-none opacity-60" : ""}>
        {/* 基本情報 */}
        <Section icon={IdCard} title="基本情報">
          <Field label="勤次郎コード" required error={errors.kinjiroCode}>
            <input
              className="input-base"
              placeholder="例：A0123"
              value={form.kinjiroCode}
              onChange={(e) => setForm((f) => ({ ...f, kinjiroCode: e.target.value }))}
            />
          </Field>
          <Field label="氏名" required error={errors.name}>
            <input
              className="input-base"
              placeholder="例：田中 花子"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="フリガナ" required error={errors.furigana}>
            <input
              className="input-base"
              placeholder="例：タナカ ハナコ"
              value={form.furigana}
              onChange={(e) => setForm((f) => ({ ...f, furigana: e.target.value }))}
            />
          </Field>
        </Section>

        {/* 所属・役割 */}
        <Section icon={Building2} title="所属・役割">
          <Field label="主所属部署" hint="ログイン中の管理者の部署が自動設定されます">
            <ReadOnlyValue value={department} />
          </Field>
          <Field label="担当管理者" hint="ログイン中の管理者が自動設定されます">
            <ReadOnlyValue value={managerName} />
          </Field>
          <Field label="主職種" required error={errors.jobType}>
            <select
              className="input-base"
              value={form.jobType}
              onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value as JobType }))}
            >
              <option value="">— 選択してください —</option>
              {JOB_TYPE_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </Field>
          <Field label="兼務部署" hint="兼務している部署があれば選択してください（任意）">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SECONDARY_DEPARTMENT_OPTIONS.filter((d) => d !== department).map((d) => {
                const checked = form.secondaryDepartments.includes(d);
                return (
                  <label
                    key={d}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
                      checked
                        ? "bg-warm-50 border-warm-300 text-warm-600"
                        : "border-cream-200 hover:bg-cream-50 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-warm-500"
                      checked={checked}
                      onChange={() => toggleSecondary(d)}
                    />
                    <span className="text-sm">{d}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        </Section>

        {/* 勤務情報 */}
        <Section icon={Briefcase} title="勤務情報">
          <Field label="雇用形態" required error={errors.employmentType}>
            <select
              className="input-base"
              value={form.employmentType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  employmentType: e.target.value as EmploymentType,
                }))
              }
            >
              <option value="">— 選択してください —</option>
              {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="入社日" required error={errors.joinedAt}>
            <input
              type="date"
              className="input-base"
              value={form.joinedAt}
              onChange={(e) => setForm((f) => ({ ...f, joinedAt: e.target.value }))}
            />
          </Field>
          <Field label="在籍状況">
            <select
              className="input-base"
              value={form.employmentStatus}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  employmentStatus: e.target.value as EmploymentStatus,
                  returnDate: e.target.value === "産休・育休中" ? f.returnDate : "",
                  retirementDate:
                    e.target.value === "退職予定" || e.target.value === "退職済"
                      ? f.retirementDate
                      : "",
                }))
              }
            >
              {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {needsReturnDate && (
            <Field label="復帰予定日" required error={errors.returnDate}>
              <input
                type="date"
                className="input-base"
                value={form.returnDate}
                onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value }))}
              />
            </Field>
          )}
          {needsRetirementDate && (
            <Field label="退職日" required error={errors.retirementDate}>
              <input
                type="date"
                className="input-base"
                value={form.retirementDate}
                onChange={(e) => setForm((f) => ({ ...f, retirementDate: e.target.value }))}
              />
            </Field>
          )}
        </Section>

        {/* 資格 */}
        <Section icon={GraduationCap} title="資格">
          <Field label="保有資格" hint="該当する資格をすべて選択してください">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUALIFICATION_OPTIONS.map((q) => {
                const checked = form.qualifications.includes(q);
                return (
                  <label
                    key={q}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
                      checked
                        ? "bg-warm-50 border-warm-300 text-warm-600"
                        : "border-cream-200 hover:bg-cream-50 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-warm-500"
                      checked={checked}
                      onChange={() => toggleQualification(q)}
                    />
                    <span className="text-sm">{q}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        </Section>

        {/* 成長情報 */}
        <Section icon={Sparkles} title="成長情報">
          <Field label="成長ステップ" hint="現在のステップを選択してください（任意）">
            <select
              className="input-base"
              value={form.growthStep}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  growthStep: e.target.value as GrowthStep,
                }))
              }
            >
              <option value="">— 未設定 —</option>
              {GROWTH_STEP_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* 備考 */}
        <Section icon={NotebookPen} title="備考">
          <Field
            label="管理者メモ"
            hint="人柄・配慮事項などのメモ（任意）。職員本人には表示されません。"
          >
            <textarea
              rows={4}
              className="input-base resize-none"
              placeholder="例：明るく前向き。利用者様からの評判が良い。"
              value={form.managerMemo}
              onChange={(e) => setForm((f) => ({ ...f, managerMemo: e.target.value }))}
            />
          </Field>
        </Section>

        {/* 保存ボタン */}
        <div className="from-cream-50 via-cream-50 sticky bottom-0 -mx-4 bg-gradient-to-t to-transparent px-4 pt-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex items-center justify-end gap-2">
            <Link
              to="/manager/staff-list"
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-5 py-2.5 text-sm font-medium transition"
            >
              キャンセル
            </Link>
            <button
              type="button"
              onClick={handleSave}
              className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold text-white transition"
            >
              <Save className="h-4 w-4" />
              保存する
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mb-5">
      <div className="border-cream-100 mb-4 flex items-center gap-2 border-b pb-3">
        <div className="bg-warm-100 text-warm-600 flex h-8 w-8 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-ink-800 text-base font-bold">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-ink-600 mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        {label}
        {required && (
          <span className="text-warm-600 bg-warm-100 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            必須
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-ink-400 mt-1.5 text-xs leading-relaxed">{hint}</p>}
      {error && <p className="mt-1.5 text-xs leading-relaxed text-orange-600">{error}</p>}
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string }) {
  return (
    <div className="border-cream-200 bg-cream-50 text-ink-800 w-full rounded-xl border px-4 py-2.5 text-sm">
      {value || "—"}
    </div>
  );
}
