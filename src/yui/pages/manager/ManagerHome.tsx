"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import {
  Users,
  FileCheck,
  MessageCircle,
  Star,
  AlertCircle,
  ChevronRight,
  ClipboardList,
  Heart,
  Sunrise,
  FileX,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/yui/auth";
import {
  staffStore,
  staffInterviewStore,
  managerInterviewStore,
  hrAssessmentStore,
  periodStore,
} from "@/yui/storage";
import type { Staff, StaffInterview, ManagerInterview, HRAssessment } from "../../types";

interface Row {
  staff: Staff;
  si: StaffInterview | null;
  mi: ManagerInterview | null;
  ha: HRAssessment | null;
}

export default function ManagerHome() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");

  useEffect(() => {
    if (!user) return;
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    setPeriodLabel(period?.label ?? "");
    const myStaff = staffStore.list().filter((s) => s.managerId === user.id && s.active);
    setRows(
      myStaff.map((s) => ({
        staff: s,
        si: staffInterviewStore.byStaffAndPeriod(s.id, pk),
        mi: managerInterviewStore.byStaffAndPeriod(s.id, pk),
        ha: hrAssessmentStore.byStaffAndPeriod(s.id, pk),
      })),
    );
  }, [user]);

  const stats = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((r) => r.si !== null).length;
    const interviewed = rows.filter((r) => r.mi?.status === "done").length;
    const hrDone = rows.filter((r) => r.ha?.status === "confirmed").length;
    return { total, submitted, interviewed, hrDone };
  }, [rows]);

  const notSubmitted = useMemo(() => rows.filter((r) => !r.si), [rows]);
  const todoInterview = useMemo(() => rows.filter((r) => r.si && r.mi?.status !== "done"), [rows]);
  const todoHR = useMemo(() => rows.filter((r) => !r.ha || r.ha.status !== "confirmed"), [rows]);
  const needFollow = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.mi && (r.mi.followUp.trim() || Object.values(r.mi.evaluation).some((v) => v === "C")),
      ),
    [rows],
  );

  const totalActions = notSubmitted.length + todoInterview.length + todoHR.length;

  if (!user) return null;

  return (
    <>
      {/* ウェルカム */}
      <section className="mb-5">
        <div className="text-warm-500 mb-1 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          <span className="text-xs font-bold tracking-[0.2em]">MANAGER HOME</span>
        </div>
        <h1 className="text-ink-800 text-2xl font-bold tracking-tight md:text-3xl">
          こんにちは、{user.name.split(" ")[0]}さん
        </h1>
        <p className="text-ink-400 mt-1 text-sm">
          {user.department} ／ {periodLabel}
        </p>
      </section>

      {/* ★ 今日やること（クリック可能なアクションタイル） */}
      <section className="mb-6">
        <div className="card from-warm-100 via-cream-50 to-sage-50 border-warm-200 bg-gradient-to-br p-5 md:p-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="chip bg-warm-500 text-white">
              <Sunrise className="h-3.5 w-3.5" />
              TODAY&apos;S TASKS
            </span>
            <span className="text-ink-400 text-xs">／ 今日やること</span>
          </div>

          {totalActions === 0 ? (
            <div className="mt-4">
              <div className="text-ink-800 mb-1 text-xl font-bold md:text-2xl">
                今日対応が必要な職員はいません 🌱
              </div>
              <p className="text-ink-600 text-sm leading-relaxed">
                全員の面談・評価が進んでいます。日々の声かけや観察を続けていきましょう。
              </p>
            </div>
          ) : (
            <>
              <div className="text-ink-800 mt-2 mb-4 text-xl font-bold md:text-2xl">
                <span className="text-warm-500">{totalActions}</span>
                <span className="text-ink-600 text-base font-medium">
                  {" "}
                  件のアクションがあります
                </span>
              </div>

              <div className="space-y-2.5">
                <ActionTile
                  icon={FileX}
                  label="シート未提出"
                  count={notSubmitted.length}
                  firstStaff={notSubmitted[0]?.staff}
                  ctaLabel="対象を確認"
                  emptyText="全員提出済"
                />
                <ActionTile
                  icon={MessageCircle}
                  label="面談待ち"
                  count={todoInterview.length}
                  firstStaff={todoInterview[0]?.staff}
                  ctaLabel="面談を開始"
                  emptyText="未面談はありません"
                  primary
                />
                <ActionTile
                  icon={Star}
                  label="人事考課 未入力"
                  count={todoHR.length}
                  firstStaff={todoHR[0]?.staff}
                  ctaLabel="考課入力へ"
                  emptyText="全員入力済み"
                  pathSuffix="/hr-assessment"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* 統計（コンパクトサマリー） */}
      <section className="mb-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ActionStat label="部署職員" value={stats.total} suffix="名" tone="ink" icon={Users} />
          <ActionStat
            label="シート提出"
            value={stats.submitted}
            total={stats.total}
            tone="sage"
            icon={FileCheck}
          />
          <ActionStat
            label="面談実施"
            value={stats.interviewed}
            total={stats.total}
            tone="warm"
            icon={MessageCircle}
          />
          <ActionStat
            label="人事考課"
            value={stats.hrDone}
            total={stats.total}
            tone="warm"
            icon={Star}
          />
        </div>
      </section>

      {/* 要フォロー職員（重要なので分けて表示） */}
      {needFollow.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h2 className="text-ink-800 flex items-center gap-2 text-base leading-tight font-bold md:text-lg">
                要フォロー職員
                <span className="chip bg-warm-100 text-warm-600">{needFollow.length}件</span>
              </h2>
              <p className="text-ink-400 text-xs">フォローメモまたは評価Cが入力されている職員</p>
            </div>
          </div>
          <div className="space-y-2">
            {needFollow.map((r) => (
              <Link
                key={r.staff.id}
                to={`/manager/staff/${r.staff.id}`}
                className="card card-hover flex items-center gap-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-600">
                  {r.staff.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-ink-800 font-medium">{r.staff.name}</div>
                  <div className="text-ink-400 truncate text-xs">
                    {r.staff.jobType} ／ {r.staff.employmentType}
                  </div>
                </div>
                <span className="chip bg-orange-100 text-orange-700">要フォロー</span>
                <ChevronRight className="text-ink-400 h-4 w-4 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 部署職員一覧へのリンク */}
      <section className="mb-6">
        <Link to="/manager/staff-list" className="card card-hover flex items-center gap-3">
          <div className="bg-warm-100 text-warm-600 flex h-10 w-10 items-center justify-center rounded-xl">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-ink-800 font-medium">部署職員一覧を見る</div>
            <div className="text-ink-400 text-xs">全員の進捗をまとめて確認できます</div>
          </div>
          <ChevronRight className="text-ink-400 h-4 w-4" />
        </Link>
      </section>
    </>
  );
}

function ActionTile({
  icon: Icon,
  label,
  count,
  firstStaff,
  ctaLabel,
  emptyText,
  primary,
  pathSuffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  firstStaff?: Staff;
  ctaLabel: string;
  emptyText: string;
  primary?: boolean;
  pathSuffix?: string;
}) {
  // 完了状態（0件）
  if (count === 0) {
    return (
      <div className="bg-sage-50 border-sage-100 flex items-center gap-3 rounded-2xl border px-4 py-3.5">
        <div className="bg-sage-100 text-sage-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sage-600 text-xs font-bold">{label}</div>
          <div className="text-ink-600 text-sm">{emptyText} ✓</div>
        </div>
      </div>
    );
  }

  // 対象あり：クリックで該当職員へ
  const dest = firstStaff ? `/manager/staff/${firstStaff.id}${pathSuffix ?? ""}` : "#";

  return (
    <Link
      to={dest}
      className={`group block rounded-2xl px-4 py-3.5 transition ${
        primary
          ? "bg-warm-500 hover:bg-warm-600 shadow-soft text-white"
          : "border-warm-200 hover:border-warm-400 hover:shadow-soft border bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            primary ? "bg-white/20 text-white" : "bg-warm-100 text-warm-600"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-bold ${primary ? "text-white/80" : "text-ink-400"}`}>
            {label}
          </div>
          <div
            className={`text-lg font-bold md:text-xl ${primary ? "text-white" : "text-ink-800"}`}
          >
            {count}名
            {firstStaff && (
              <span
                className={`ml-2 text-xs font-medium md:text-sm ${
                  primary ? "text-white/80" : "text-ink-600"
                }`}
              >
                {count === 1 ? `${firstStaff.name}さん` : `まずは ${firstStaff.name}さんから`}
              </span>
            )}
          </div>
        </div>
        <div
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold md:text-sm ${
            primary
              ? "text-warm-600 group-hover:bg-cream-50 bg-white"
              : "bg-warm-500 group-hover:bg-warm-600 text-white"
          }`}
        >
          {ctaLabel}
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function ActionStat({
  label,
  value,
  total,
  suffix,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  total?: number;
  suffix?: string;
  tone: "ink" | "sage" | "warm";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneStyle =
    tone === "sage"
      ? "bg-sage-100 text-sage-600"
      : tone === "warm"
        ? "bg-warm-100 text-warm-600"
        : "bg-cream-100 text-ink-600";

  return (
    <div className="card">
      <div className="text-ink-400 mb-2 flex items-center gap-2 text-xs">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneStyle}`}>
          <Icon className="h-4 w-4" />
        </div>
        {label}
      </div>
      <div className="text-ink-800 text-2xl font-bold">
        {value}
        {total !== undefined && (
          <span className="text-ink-400 text-sm font-normal"> / {total}</span>
        )}
        {suffix && <span className="text-ink-400 text-sm font-normal">{suffix}</span>}
      </div>
    </div>
  );
}
