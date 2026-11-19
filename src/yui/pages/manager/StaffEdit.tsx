"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@/yui/router";
import {
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
import { staffStore } from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import type {
  Staff,
  Department,
  JobType,
  EmploymentType,
  EmploymentStatus,
  Qualification,
  GrowthStep,
  Position,
} from "../../types";
import {
  JOB_TYPE_OPTIONS,
  POSITION_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  QUALIFICATION_OPTIONS,
  GROWTH_STEP_OPTIONS,
  SECONDARY_DEPARTMENT_OPTIONS,
  ALL_DEPARTMENTS,
  DEPARTMENT_MASTER,
} from "../../types";

interface FormState {
  name: string;
  furigana: string;
  department: Department | "";
  secondaryDepartments: Department[];
  managerId: string;
  jobType: JobType | "";
  position: Position | "";
  employmentType: EmploymentType | "";
  joinedAt: string;
  employmentStatus: EmploymentStatus;
  returnDate: string;
  retirementDate: string;
  qualifications: Qualification[];
  growthStep: GrowthStep | "";
  managerMemo: string;
}

export default function StaffEdit() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();

  const [existing, setExisting] = useState<Staff | null>(null);
  const [managers, setManagers] = useState<Staff[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    const s = staffStore.get(staffId);
    if (!s) {
      setNotFound(true);
      return;
    }
    setExisting(s);
    setManagers(
      staffStore
        .list()
        .filter((m) => m.role === "manager")
        .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, "ja")),
    );
    setForm({
      name: s.name,
      furigana: s.furigana ?? "",
      department: s.department,
      secondaryDepartments: s.secondaryDepartments ?? [],
      managerId: s.managerId ?? "",
      jobType: s.jobType,
      position: s.position ?? "",
      employmentType: s.employmentType,
      joinedAt: s.joinedAt ?? "",
      employmentStatus: s.employmentStatus ?? "在籍中",
      returnDate: s.returnDate ?? "",
      retirementDate: s.retirementDate ?? "",
      qualifications: s.qualifications ?? [],
      growthStep: s.growthStep ?? "",
      managerMemo: s.managerMemo ?? "",
    });
  }, [staffId]);

  const needsReturnDate = form?.employmentStatus === "産休・育休中";
  const needsRetirementDate =
    form?.employmentStatus === "退職予定" || form?.employmentStatus === "退職済";

  // 兼務候補（主所属部署を除外）
  const secondaryOptions = useMemo(
    () => SECONDARY_DEPARTMENT_OPTIONS.filter((d) => d !== form?.department),
    [form?.department],
  );

  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const toggleSecondary = (d: Department) =>
    setForm((f) =>
      f
        ? {
            ...f,
            secondaryDepartments: f.secondaryDepartments.includes(d)
              ? f.secondaryDepartments.filter((x) => x !== d)
              : [...f.secondaryDepartments, d],
          }
        : f,
    );

  const toggleQualification = (q: Qualification) =>
    setForm((f) =>
      f
        ? {
            ...f,
            qualifications: f.qualifications.includes(q)
              ? f.qualifications.filter((x) => x !== q)
              : [...f.qualifications, q],
          }
        : f,
    );

  const validate = (f: FormState): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!f.name.trim()) next.name = "氏名を入力してください";
    if (!f.department) next.department = "所属部署を選択してください";
    if (!f.jobType) next.jobType = "主職種を選択してください";
    if (!f.employmentType) next.employmentType = "雇用形態を選択してください";
    if (!f.joinedAt) next.joinedAt = "入職日を入力してください";
    if (f.employmentStatus === "産休・育休中" && !f.returnDate)
      next.returnDate = "復帰予定日を入力してください";
    if ((f.employmentStatus === "退職予定" || f.employmentStatus === "退職済") && !f.retirementDate)
      next.retirementDate = "退職日を入力してください";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!existing || !form) return;
    if (!validate(form)) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const updated: Staff = {
      // 既存レコードを土台にし、未編集フィールド（role等）を保全
      ...existing,
      name: form.name.trim(),
      furigana: form.furigana.trim() || undefined,
      department: form.department as Department,
      secondaryDepartments:
        form.secondaryDepartments.length > 0 ? form.secondaryDepartments : undefined,
      managerId: form.managerId || null,
      jobType: form.jobType as JobType,
      position: form.position || undefined,
      employmentType: form.employmentType as EmploymentType,
      joinedAt: form.joinedAt,
      employmentStatus: form.employmentStatus,
      returnDate: needsReturnDate ? form.returnDate : null,
      retirementDate: needsRetirementDate ? form.retirementDate : null,
      qualifications: form.qualifications.length > 0 ? form.qualifications : undefined,
      growthStep: form.growthStep || undefined,
      managerMemo: form.managerMemo.trim() || undefined,
      active: form.employmentStatus !== "退職済",
    };
    staffStore.upsert(updated);
    setSaved(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (notFound) {
    return (
      <>
        <PageHeader title="職員情報の編集" />
        <div className="card text-ink-400 py-12 text-center">
          職員データが見つかりませんでした。
          <div className="mt-4">
            <Link
              to="/manager/staff-list"
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
            >
              <ArrowLeft className="h-4 w-4" />
              部署職員一覧に戻る
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (!form) return null;

  return (
    <>
      <PageHeader
        title="職員情報の編集"
        subtitle={`${existing?.name ?? ""} さんの情報を更新します`}
        right={
          <Link
            to={`/manager/staff/${staffId}`}
            className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            カルテに戻る
          </Link>
        }
      />

      {saved && (
        <div className="card bg-sage-50 border-sage-200 mb-6">
          <div className="flex items-start gap-3">
            <div className="bg-sage-500 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sage-700 text-sm font-bold">保存しました</div>
              <div className="text-ink-800 mt-0.5">
                <span className="font-medium">{form.name}</span> さんの情報を更新しました。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/manager/staff/${staffId}`)}
                  className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition"
                >
                  職員カルテへ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!saved && Object.keys(errors).length > 0 && (
        <div className="card mb-6 border-orange-200 bg-orange-50">
          <div className="text-sm font-bold text-orange-700">未入力の項目があります</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-orange-700">
            {Object.values(errors).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={saved ? "pointer-events-none opacity-60" : ""}>
        {/* 基本情報 */}
        <Section icon={IdCard} title="基本情報">
          <Field label="氏名" required error={errors.name}>
            <input
              className="input-base"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field label="フリガナ" required error={errors.furigana}>
            <input
              className="input-base"
              value={form.furigana}
              onChange={(e) => update({ furigana: e.target.value })}
            />
          </Field>
        </Section>

        {/* 所属・役割 */}
        <Section icon={Building2} title="所属・役割">
          <Field label="主所属部署" required error={errors.department}>
            <select
              className="input-base"
              value={form.department}
              onChange={(e) =>
                update({
                  department: e.target.value as Department,
                  // 主所属に選んだ部署が兼務に残らないよう除外
                  secondaryDepartments: form.secondaryDepartments.filter(
                    (d) => d !== (e.target.value as Department),
                  ),
                })
              }
            >
              <option value="">— 選択してください —</option>
              {ALL_DEPARTMENTS.map((d) => {
                const isPrep = DEPARTMENT_MASTER.find((m) => m.name === d)?.status === "prep";
                return (
                  <option key={d} value={d}>
                    {d}
                    {isPrep ? "（準備中）" : ""}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="担当管理者">
            <select
              className="input-base"
              value={form.managerId}
              onChange={(e) => update({ managerId: e.target.value })}
            >
              <option value="">— 未設定 —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.department}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="主職種" required error={errors.jobType}>
            <select
              className="input-base"
              value={form.jobType}
              onChange={(e) => update({ jobType: e.target.value as JobType })}
            >
              <option value="">— 選択してください —</option>
              {JOB_TYPE_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </Field>
          <Field label="職位／職責" hint="該当する職位があれば選択してください（任意）">
            <select
              className="input-base"
              value={form.position}
              onChange={(e) => update({ position: e.target.value as Position | "" })}
            >
              <option value="">— 未設定 —</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="兼務部署" hint="兼務している部署があれば選択してください（任意）">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {secondaryOptions.map((d) => {
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
              onChange={(e) => update({ employmentType: e.target.value as EmploymentType })}
            >
              <option value="">— 選択してください —</option>
              {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="入職日" required error={errors.joinedAt}>
            <input
              type="date"
              className="input-base"
              value={form.joinedAt}
              onChange={(e) => update({ joinedAt: e.target.value })}
            />
          </Field>
          <Field label="在籍状況">
            <select
              className="input-base"
              value={form.employmentStatus}
              onChange={(e) =>
                update({
                  employmentStatus: e.target.value as EmploymentStatus,
                  returnDate: e.target.value === "産休・育休中" ? form.returnDate : "",
                  retirementDate:
                    e.target.value === "退職予定" || e.target.value === "退職済"
                      ? form.retirementDate
                      : "",
                })
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
                onChange={(e) => update({ returnDate: e.target.value })}
              />
            </Field>
          )}
          {needsRetirementDate && (
            <Field label="退職日" required error={errors.retirementDate}>
              <input
                type="date"
                className="input-base"
                value={form.retirementDate}
                onChange={(e) => update({ retirementDate: e.target.value })}
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
          <Field label="成長STEP" hint="現在のステップを選択してください（任意）">
            <select
              className="input-base"
              value={form.growthStep}
              onChange={(e) => update({ growthStep: e.target.value as GrowthStep })}
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
              value={form.managerMemo}
              onChange={(e) => update({ managerMemo: e.target.value })}
            />
          </Field>
        </Section>

        {/* 保存ボタン */}
        <div className="from-cream-50 via-cream-50 sticky bottom-0 -mx-4 bg-gradient-to-t to-transparent px-4 pt-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex items-center justify-end gap-2">
            <Link
              to={`/manager/staff/${staffId}`}
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
