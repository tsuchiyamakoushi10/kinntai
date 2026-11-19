"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@/yui/router";
import { Save, CheckCircle2, ArrowLeft, IdCard, Building2, Briefcase, Users } from "lucide-react";
import { staffStore, uid } from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import type { Staff, Department, EmploymentType } from "../../types";
import { ACTIVE_DEPARTMENTS, EMPLOYMENT_TYPE_OPTIONS } from "../../types";

interface FormState {
  name: string;
  furigana: string;
  email: string;
  department: Department | "";
  joinedAt: string;
  employmentType: EmploymentType | "";
  active: boolean;
}

const emptyForm: FormState = {
  name: "",
  furigana: "",
  email: "",
  department: "",
  joinedAt: "",
  employmentType: "正社員",
  active: true,
};

export default function AdminEdit() {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(adminId);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 編集時に既存レコードを保持し、面談等に紐づく項目を保全する
  const [existing, setExisting] = useState<Staff | null>(null);

  // CrossShift 追加: 新規のときは、登録済みの職員を選んで管理者にできる (同じ人を二重に登録しないため)
  const [pickId, setPickId] = useState("");
  const candidates = isEdit
    ? []
    : staffStore
        .list()
        .filter((s) => s.role === "staff" && s.active)
        .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, "ja"));
  const pickStaff = (id: string) => {
    setPickId(id);
    const s = id ? staffStore.get(id) : null;
    setExisting(s);
    setForm(
      s
        ? {
            name: s.name,
            furigana: s.furigana ?? "",
            email: s.email ?? "",
            department: s.department,
            joinedAt: s.joinedAt ?? "",
            employmentType: s.employmentType,
            active: true,
          }
        : emptyForm,
    );
  };

  useEffect(() => {
    if (!adminId) return;
    const s = staffStore.get(adminId);
    if (!s || s.role !== "manager") {
      setNotFound(true);
      return;
    }
    setExisting(s);
    setForm({
      name: s.name,
      furigana: s.furigana ?? "",
      email: s.email ?? "",
      department: s.department,
      joinedAt: s.joinedAt ?? "",
      employmentType: s.employmentType,
      active: s.active,
    });
  }, [adminId]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "氏名を入力してください";
    if (!form.department) next.department = "所属部署を選択してください";
    if (!form.employmentType) next.employmentType = "雇用形態を選択してください";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const staff: Staff = {
      // 編集時は既存レコードを土台にし、未編集フィールド（資格・メモ等）を保全
      ...(existing ?? {}),
      id: existing?.id ?? uid("user_manager"),
      name: form.name.trim(),
      furigana: form.furigana.trim() || undefined,
      email: form.email.trim() || undefined,
      department: form.department as Department,
      jobType: "管理者",
      joinedAt: form.joinedAt,
      employmentType: form.employmentType as EmploymentType,
      role: "manager",
      managerId: null,
      active: form.active,
    };
    staffStore.upsert(staff);
    setSaved(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (notFound) {
    return (
      <>
        <PageHeader title="管理者編集" />
        <div className="card text-ink-400 py-12 text-center">
          指定された管理者が見つかりませんでした。
          <div className="mt-4">
            <Link
              to="/president/settings/admins"
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
            >
              <ArrowLeft className="h-4 w-4" />
              管理者一覧に戻る
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? "管理者の編集" : "管理者の追加"}
        subtitle={isEdit ? "管理者情報を更新します" : "新しい管理者を登録します"}
        right={
          <Link
            to="/president/settings/admins"
            className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
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
                <span className="font-medium">{form.name}</span> さん（管理者）を
                {form.department} に{isEdit ? "更新" : "登録"}しました。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/president/settings/admins")}
                  className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition"
                >
                  管理者一覧へ
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
        {!isEdit && (
          <Section icon={Users} title="職員から選ぶ">
            <Field
              label="登録済みの職員"
              hint="選ぶと、その職員を管理者にします。新しい人を登録するときは空欄のまま"
            >
              <select
                className="input-base"
                value={pickId}
                onChange={(e) => pickStaff(e.target.value)}
              >
                <option value="">（新しく登録する）</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.department}）
                  </option>
                ))}
              </select>
            </Field>
          </Section>
        )}

        <Section icon={IdCard} title="基本情報">
          <Field label="氏名" required error={errors.name}>
            <input
              className="input-base"
              placeholder="例：佐藤 美咲"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="フリガナ">
            <input
              className="input-base"
              placeholder="例：サトウ ミサキ"
              value={form.furigana}
              onChange={(e) => setForm((f) => ({ ...f, furigana: e.target.value }))}
            />
          </Field>
          <Field label="メールアドレス" hint="将来のGoogle認証で利用予定（任意）">
            <input
              type="email"
              className="input-base"
              placeholder="例：sato@cross-heart.example"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
        </Section>

        {/* 所属 */}
        <Section icon={Building2} title="所属">
          <Field label="所属部署" required error={errors.department}>
            <select
              className="input-base"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))}
            >
              <option value="">— 選択してください —</option>
              {ACTIVE_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="職種">
            <ReadOnlyValue value="管理者（固定）" />
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
          <Field label="入社日">
            <input
              type="date"
              className="input-base"
              value={form.joinedAt}
              onChange={(e) => setForm((f) => ({ ...f, joinedAt: e.target.value }))}
            />
          </Field>
          <Field
            label="アカウント状態"
            hint="無効にするとモード切替などの一覧に表示されなくなります"
          >
            <label className="border-cream-200 flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2.5">
              <input
                type="checkbox"
                className="accent-warm-500"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span className="text-ink-800 text-sm">有効（在籍中の管理者として扱う）</span>
            </label>
          </Field>
        </Section>

        {/* 保存ボタン */}
        <div className="from-cream-50 via-cream-50 sticky bottom-0 -mx-4 bg-gradient-to-t to-transparent px-4 pt-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex items-center justify-end gap-2">
            <Link
              to="/president/settings/admins"
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
