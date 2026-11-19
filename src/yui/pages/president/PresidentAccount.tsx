"use client";

import { useEffect, useState } from "react";
import { Link } from "@/yui/router";
import { Save, CheckCircle2, ArrowLeft, IdCard, Building2 } from "lucide-react";
import { staffStore } from "@/yui/storage";
import { useAuth } from "@/yui/auth";
import PageHeader from "../../components/PageHeader";
import type { Staff, Department } from "../../types";
import { ACTIVE_DEPARTMENTS } from "../../types";

interface FormState {
  name: string;
  furigana: string;
  email: string;
  department: Department | "";
  titleLabel: string;
}

const emptyForm: FormState = {
  name: "",
  furigana: "",
  email: "",
  department: "",
  titleLabel: "",
};

export default function PresidentAccount() {
  const { refresh } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 既存の社長レコードを保持し、面談等に紐づく項目（id・role・入職日等）を保全する
  const [existing, setExisting] = useState<Staff | null>(null);

  useEffect(() => {
    const president = staffStore.list().find((s) => s.role === "president");
    if (!president) {
      setNotFound(true);
      return;
    }
    setExisting(president);
    setForm({
      name: president.name,
      furigana: president.furigana ?? "",
      email: president.email ?? "",
      department: president.department,
      titleLabel: president.titleLabel ?? "",
    });
  }, []);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "氏名を入力してください";
    if (!form.department) next.department = "所属部署を選択してください";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!existing) return;
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const staff: Staff = {
      // 既存レコードを土台にし、role・id・入職日・面談関連を保全
      ...existing,
      name: form.name.trim(),
      furigana: form.furigana.trim() || undefined,
      email: form.email.trim() || undefined,
      department: form.department as Department,
      titleLabel: form.titleLabel.trim() || undefined,
      role: "president",
    };
    staffStore.upsert(staff);
    setExisting(staff);
    // ログイン中の社長自身を編集したため、AuthContextのuserを取り直してトップ画面等に反映
    refresh();
    setSaved(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (notFound) {
    return (
      <>
        <PageHeader title="社長アカウント設定" />
        <div className="card text-ink-400 py-12 text-center">
          社長アカウントが見つかりませんでした。
          <div className="mt-4">
            <Link
              to="/president/settings"
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
            >
              <ArrowLeft className="h-4 w-4" />
              設定に戻る
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="社長アカウント設定"
        subtitle="ログイン画面の社長として表示される情報を編集します"
        right={
          <Link
            to="/president/settings"
            className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            設定に戻る
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
                社長アカウントを <span className="font-medium">{form.name}</span>
                {form.titleLabel && <>（{form.titleLabel}）</>} に更新しました。
                ログイン画面の社長タブに反映されます。
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

      <div>
        {/* 基本情報 */}
        <Section icon={IdCard} title="基本情報">
          <Field label="氏名" required error={errors.name}>
            <input
              className="input-base"
              placeholder="例：山田 太郎"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="フリガナ">
            <input
              className="input-base"
              placeholder="例：ヤマダ タロウ"
              value={form.furigana}
              onChange={(e) => setForm((f) => ({ ...f, furigana: e.target.value }))}
            />
          </Field>
          <Field label="メールアドレス" hint="将来のGoogle認証で利用予定（任意）">
            <input
              type="email"
              className="input-base"
              placeholder="例：president@cross-heart.example"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
        </Section>

        {/* 所属・肩書 */}
        <Section icon={Building2} title="所属・肩書">
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
          <Field
            label="表示肩書"
            hint="ログイン画面の社長タブに表示されます（例：代表、社長、代表取締役）。未入力の場合は職種が表示されます。"
          >
            <input
              className="input-base"
              placeholder="例：代表"
              value={form.titleLabel}
              onChange={(e) => setForm((f) => ({ ...f, titleLabel: e.target.value }))}
            />
          </Field>
          <Field label="権限">
            <ReadOnlyValue value="社長（固定）" />
          </Field>
        </Section>

        {/* 保存ボタン */}
        <div className="from-cream-50 via-cream-50 sticky bottom-0 -mx-4 bg-gradient-to-t to-transparent px-4 pt-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex items-center justify-end gap-2">
            <Link
              to="/president/settings"
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
