"use client";

import { useEffect, useState } from "react";
import { Link, useParams } from "@/yui/router";
import {
  ArrowLeft,
  MessageCircle,
  Pencil,
  IdCard,
  Building2,
  Briefcase,
  GraduationCap,
  Sparkles,
  NotebookPen,
  ClipboardCheck,
} from "lucide-react";
import { staffStore } from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import type { Staff } from "../../types";
import { GROWTH_STEP_OPTIONS } from "../../types";
import { formatDate, tenureLabel } from "../../utils/date";

export default function StaffChart() {
  const { staffId } = useParams<{ staffId: string }>();
  // localStorageから毎レンダリング時に直接読む（stale state防止）
  const staff = staffId ? staffStore.get(staffId) : null;
  const manager = staff?.managerId ? staffStore.get(staff.managerId) : null;
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!staffId || staffStore.get(staffId)) return;
    setNotFound(true);
  }, [staffId]);

  if (notFound) {
    return (
      <>
        <PageHeader title="職員カルテ" />
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

  if (!staff) return null;

  const growthStepLabel = staff.growthStep
    ? (GROWTH_STEP_OPTIONS.find((o) => o.value === staff.growthStep)?.label ?? staff.growthStep)
    : "—";
  const secondary =
    staff.secondaryDepartments && staff.secondaryDepartments.length > 0
      ? staff.secondaryDepartments.join("、")
      : "—";
  const qualifications =
    staff.qualifications && staff.qualifications.length > 0 ? staff.qualifications.join("、") : "—";
  const status = staff.employmentStatus ?? "在籍中";

  return (
    <>
      <div className="mb-4">
        <Link
          to="/manager/staff-list"
          className="text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          部署職員一覧に戻る
        </Link>
      </div>

      <PageHeader
        title={staff.name}
        subtitle={`${staff.department} ／ ${staff.jobType}（${staff.employmentType}）／ 在籍 ${tenureLabel(staff.joinedAt)}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/manager/staff/${staff.id}/edit`}
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2.5 text-sm font-medium transition"
            >
              <Pencil className="h-4 w-4" />
              職員情報を編集
            </Link>
            <Link
              to={`/manager/staff/${staff.id}/hr-assessment`}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-[#EBF3FF] px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              <ClipboardCheck className="h-4 w-4" />
              人事考課
            </Link>
            <Link
              to={`/manager/staff/${staff.id}/interview`}
              className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white transition"
            >
              <MessageCircle className="h-4 w-4" />
              面談へ進む
            </Link>
          </div>
        }
      />

      {/* 基本情報 */}
      <Section icon={IdCard} title="基本情報">
        <Item label="氏名" value={staff.name} />
        <Item label="フリガナ" value={staff.furigana ?? "—"} />
      </Section>

      {/* 所属・役割 */}
      <Section icon={Building2} title="所属・役割">
        <Item label="所属部署" value={staff.department} />
        <Item label="兼務部署" value={secondary} />
        <Item label="担当管理者" value={manager?.name ?? "—"} />
        <Item label="職種" value={staff.jobType} />
        <Item label="職位／職責" value={staff.position ?? "—"} />
      </Section>

      {/* 勤務情報 */}
      <Section icon={Briefcase} title="勤務情報">
        <Item label="雇用形態" value={staff.employmentType} />
        <Item label="入職日" value={formatDate(staff.joinedAt)} />
        <Item label="雇用期間" value={tenureLabel(staff.joinedAt)} />
        <Item
          label="在籍状況"
          value={<StatusBadge label={status} variant={statusVariant(status)} />}
        />
        {status === "産休・育休中" && (
          <Item label="復帰予定日" value={formatDate(staff.returnDate)} />
        )}
        {(status === "退職予定" || status === "退職済") && (
          <Item label="退職日" value={formatDate(staff.retirementDate)} />
        )}
      </Section>

      {/* 資格 */}
      <Section icon={GraduationCap} title="資格">
        <Item label="保有資格" value={qualifications} />
      </Section>

      {/* 成長情報 */}
      <Section icon={Sparkles} title="成長情報">
        <Item label="成長STEP" value={growthStepLabel} />
      </Section>

      {/* 管理者メモ */}
      <Section icon={NotebookPen} title="管理者メモ">
        <div className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
          {staff.managerMemo?.trim() || "（メモはありません）"}
        </div>
      </Section>
    </>
  );
}

function statusVariant(status: string): "done" | "progress" | "pending" {
  if (status === "在籍中") return "done";
  if (status === "退職済") return "pending";
  return "progress";
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
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
      <dt className="text-ink-400 w-full shrink-0 text-sm sm:w-32">{label}</dt>
      <dd className="text-ink-800 text-sm font-medium">{value}</dd>
    </div>
  );
}
