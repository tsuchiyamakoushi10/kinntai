"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import {
  Users,
  FileCheck,
  MessageCircle,
  Star,
  AlertCircle,
  Building2,
  Heart,
  Hourglass,
  ChevronRight,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react";
import {
  staffStore,
  staffInterviewStore,
  managerInterviewStore,
  presidentReviewStore,
  periodStore,
} from "@/yui/storage";
import type {
  Staff,
  StaffInterview,
  ManagerInterview,
  PresidentReview,
  EvalRank,
} from "../../types";
import EvalBadge from "../../components/EvalBadge";
import { useAuth } from "@/yui/auth";

interface Row {
  staff: Staff;
  si: StaffInterview | null;
  mi: ManagerInterview | null;
  pr: PresidentReview | null;
}

// 要フォロー判定（社長判定が最優先、次に管理者のfollowUp/ C評価）
function needsFollow(r: Row): boolean {
  if (r.pr?.needsFollowUp) return true;
  if (r.mi?.followUp?.trim()) return true;
  if (r.mi && Object.values(r.mi.evaluation).some((v) => v === "C")) return true;
  return false;
}

// 一次評価の状況ラベル
function evalStatus(r: Row): "未提出" | "面談前" | "評価中" | "評価済" {
  if (!r.si) return "未提出";
  if (!r.mi) return "面談前";
  const allFilled = Object.values(r.mi.evaluation).every((v) => v !== null);
  return allFilled ? "評価済" : "評価中";
}

export default function PresidentDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");

  useEffect(() => {
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    setPeriodLabel(period?.label ?? "");

    const staffs = staffStore.list().filter((s) => s.role === "staff" && s.active);
    setRows(
      staffs.map((s) => ({
        staff: s,
        si: staffInterviewStore.byStaffAndPeriod(s.id, pk),
        mi: managerInterviewStore.byStaffAndPeriod(s.id, pk),
        pr: presidentReviewStore.byStaffAndPeriod(s.id, pk),
      })),
    );
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((r) => r.si).length;
    const interviewed = rows.filter((r) => r.mi?.status === "done").length;
    const evaluated = rows.filter(
      (r) => r.mi && Object.values(r.mi.evaluation).every((v) => v !== null),
    ).length;
    return { total, submitted, interviewed, evaluated };
  }, [rows]);

  // 社長確認待ち：管理者面談済 かつ 社長未確認
  const pendingConfirmations = useMemo(
    () => rows.filter((r) => r.mi?.status === "done" && r.pr?.status !== "confirmed"),
    [rows],
  );

  // 評価分布
  const evalDist = useMemo(() => {
    const counts: Record<EvalRank, number> = { S: 0, A: 0, B: 0, C: 0 };
    let total = 0;
    rows.forEach((r) => {
      if (!r.mi) return;
      Object.values(r.mi.evaluation).forEach((v) => {
        if (v) {
          counts[v as EvalRank]++;
          total++;
        }
      });
    });
    return { counts, total };
  }, [rows]);

  // 所属別集計
  const byDept = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    rows.forEach((r) => {
      const key = r.staff.department;
      const cur = map.get(key) ?? { total: 0, done: 0 };
      cur.total++;
      if (r.mi?.status === "done") cur.done++;
      map.set(key, cur);
    });
    return Array.from(map.entries());
  }, [rows]);

  // 管理者別集計
  const byManager = useMemo(() => {
    const managers = staffStore.list().filter((s) => s.role === "manager" && s.active);
    return managers.map((mgr) => {
      const myRows = rows.filter((r) => r.staff.managerId === mgr.id);
      const done = myRows.filter((r) => r.mi?.status === "done").length;
      const evaluated = myRows.filter(
        (r) => r.mi && Object.values(r.mi.evaluation).every((v) => v !== null),
      ).length;
      const follow = myRows.filter((r) => needsFollow(r)).length;
      return { manager: mgr, total: myRows.length, done, evaluated, follow, myRows };
    });
  }, [rows]);

  // 要フォロー職員（社長判定が最優先、次に管理者の followUp / C評価）
  const needFollow = useMemo(() => {
    return rows
      .filter((r) => {
        if (r.pr?.needsFollowUp) return true;
        if (r.mi?.followUp?.trim()) return true;
        if (r.mi && Object.values(r.mi.evaluation).some((v) => v === "C")) return true;
        return false;
      })
      .map((r) => {
        const bySource: "president" | "manager" = r.pr?.needsFollowUp ? "president" : "manager";
        const note = r.pr?.needsFollowUp ? (r.pr.followUpReason ?? "") : (r.mi?.followUp ?? "");
        return { ...r, source: bySource, note };
      });
  }, [rows]);

  return (
    <>
      {/* ウェルカム */}
      <section className="mb-5">
        <div className="text-warm-500 mb-1 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          <span className="text-xs font-bold tracking-[0.2em]">PRESIDENT HOME</span>
        </div>
        <h1 className="text-ink-800 text-2xl font-bold tracking-tight md:text-3xl">
          こんにちは、{user?.name.split(" ")[0] ?? ""}さん
        </h1>
        <p className="text-ink-400 mt-1 text-sm">全体把握 ／ {periodLabel}</p>
      </section>

      {/* ★ 確認待ち ヒーロー */}
      <section className="mb-6">
        {pendingConfirmations.length === 0 ? (
          <div className="card from-sage-50 via-cream-50 to-warm-50 border-sage-100 bg-gradient-to-br p-5 md:p-6">
            <div className="mb-1 flex items-center gap-2">
              <span className="chip bg-sage-500 text-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
                TODAY
              </span>
              <span className="text-ink-400 text-xs">／ 今日確認すること</span>
            </div>
            <h2 className="text-ink-800 mt-3 mb-1 text-xl font-bold md:text-2xl">
              確認待ちはありません 🌱
            </h2>
            <p className="text-ink-600 text-sm leading-relaxed">
              現時点で社長確認が必要な職員はいません。全体の流れを下記でご確認ください。
            </p>
          </div>
        ) : (
          <div className="card from-warm-100 via-cream-50 to-sage-50 border-warm-200 bg-gradient-to-br p-5 md:p-6">
            <div className="mb-1 flex items-center gap-2">
              <span className="chip bg-warm-500 text-white">
                <Hourglass className="h-3.5 w-3.5" />
                TODAY
              </span>
              <span className="text-ink-400 text-xs">／ 今日確認すること</span>
            </div>
            <div className="text-ink-800 mt-3 mb-2 text-xl font-bold md:text-2xl">
              <span className="text-warm-500">{pendingConfirmations.length}</span>
              <span className="text-ink-600 text-base font-medium"> 名の確認待ちがあります</span>
            </div>
            <p className="text-ink-600 mb-4 text-sm leading-relaxed">
              管理者面談が完了した職員さんの最終確認をお願いします。
              <br />
              まずは{" "}
              <strong className="text-ink-800">
                {pendingConfirmations[0]!.staff.name}さん
              </strong>{" "}
              から。
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Link
                to={`/president/staff/${pendingConfirmations[0]!.staff.id}`}
                className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white transition"
              >
                <ClipboardCheck className="h-5 w-5" />
                {pendingConfirmations[0]!.staff.name}さんを確認する
                <ChevronRight className="h-5 w-5" />
              </Link>
              {pendingConfirmations.length > 1 && (
                <Link
                  to="/president/review"
                  className="text-ink-800 border-cream-200 hover:bg-cream-50 inline-flex items-center justify-center gap-2 rounded-full border bg-white px-6 py-3 text-sm font-medium transition"
                >
                  確認待ち一覧を見る（{pendingConfirmations.length}名）
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 統計サマリー */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="対象職員" value={stats.total} suffix="名" tone="ink" />
        <StatCard
          icon={FileCheck}
          label="シート提出"
          value={stats.submitted}
          total={stats.total}
          tone="sage"
        />
        <StatCard
          icon={MessageCircle}
          label="面談実施"
          value={stats.interviewed}
          total={stats.total}
          tone="warm"
        />
        <StatCard
          icon={Star}
          label="一次評価完了"
          value={stats.evaluated}
          total={stats.total}
          tone="warm"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 評価分布 */}
        <div className="card">
          <h2 className="text-ink-800 mb-4 text-lg font-bold">評価分布</h2>
          {evalDist.total === 0 ? (
            <div className="text-ink-400 py-6 text-center text-sm">まだ評価データがありません</div>
          ) : (
            <div className="space-y-3">
              {(["S", "A", "B", "C"] as EvalRank[]).map((rank) => {
                const n = evalDist.counts[rank];
                const pct = evalDist.total ? Math.round((n / evalDist.total) * 100) : 0;
                return (
                  <div key={rank} className="flex items-center gap-3">
                    <EvalBadge rank={rank} />
                    <div className="flex-1">
                      <div className="bg-cream-100 h-2 overflow-hidden rounded-full">
                        <div
                          className={`h-full ${
                            rank === "S"
                              ? "bg-warm-500"
                              : rank === "A"
                                ? "bg-warm-300"
                                : rank === "B"
                                  ? "bg-sage-300"
                                  : "bg-cream-200"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-ink-800 w-16 text-right text-sm font-medium">
                      {n}件 ({pct}%)
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 所属別進捗 */}
        <div className="card">
          <h2 className="text-ink-800 mb-4 text-lg font-bold">所属別 面談進捗</h2>
          <div className="space-y-3">
            {byDept.map(([dept, val]) => {
              const pct = val.total ? Math.round((val.done / val.total) * 100) : 0;
              return (
                <div key={dept}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <div className="text-ink-800 flex items-center gap-2 font-medium">
                      <Building2 className="text-ink-400 h-4 w-4" />
                      {dept}
                    </div>
                    <div className="text-ink-400">
                      {val.done} / {val.total} ({pct}%)
                    </div>
                  </div>
                  <div className="bg-cream-100 h-2 overflow-hidden rounded-full">
                    <div className="bg-sage-400 h-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 管理者別 */}
        <div className="card lg:col-span-2">
          <h2 className="text-ink-800 mb-4 text-lg font-bold">管理者別 進捗サマリー</h2>
          {byManager.length === 0 ? (
            <div className="text-ink-400 py-6 text-center text-sm">管理者が登録されていません</div>
          ) : (
            <div className="space-y-3">
              {byManager.map(({ manager, total, done, evaluated, follow }) => {
                const intPct = total ? Math.round((done / total) * 100) : 0;
                const evalPct = total ? Math.round((evaluated / total) * 100) : 0;
                return (
                  <div key={manager.id} className="border-cream-200 rounded-xl border bg-white p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="bg-warm-100 text-warm-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold">
                        {manager.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-ink-800 font-medium">{manager.name}</div>
                        <div className="text-ink-400 text-xs">
                          {manager.department} ／ 担当 {total}名
                        </div>
                      </div>
                      {follow > 0 && (
                        <span className="chip shrink-0 bg-orange-100 text-orange-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          要フォロー {follow}名
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <ManagerStat
                        label="面談実施"
                        value={done}
                        total={total}
                        pct={intPct}
                        icon={MessageCircle}
                        color="warm"
                      />
                      <ManagerStat
                        label="一次評価入力"
                        value={evaluated}
                        total={total}
                        pct={evalPct}
                        icon={Star}
                        color="sage"
                      />
                      <ManagerStat
                        label="要フォロー"
                        value={follow}
                        suffix="名"
                        icon={AlertCircle}
                        color={follow > 0 ? "orange" : "gray"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 要フォロー */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="text-warm-500 h-5 w-5" />
            <h2 className="text-ink-800 text-lg font-bold">要フォロー職員</h2>
          </div>
          {needFollow.length === 0 ? (
            <div className="text-ink-400 py-6 text-center text-sm">
              現時点で特別なフォローが必要な職員はいません
            </div>
          ) : (
            <div className="space-y-2">
              {needFollow.map((r) => (
                <Link
                  key={r.staff.id}
                  to={`/president/staff/${r.staff.id}`}
                  className="border-warm-100 bg-warm-50 hover:border-warm-300 block rounded-xl border p-3 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-ink-800 font-medium">{r.staff.name}</div>
                      <div className="text-ink-400 text-xs">{r.staff.department}</div>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        r.source === "president"
                          ? "bg-warm-500 text-white"
                          : "bg-warm-200 text-warm-600"
                      }`}
                    >
                      {r.source === "president" ? "社長判定" : "管理者判定"}
                    </span>
                  </div>
                  {r.note && (
                    <div className="text-ink-600 mt-2 text-sm leading-relaxed">{r.note}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ManagerStat({
  label,
  value,
  total,
  pct,
  suffix,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  pct?: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "warm" | "sage" | "orange" | "gray";
}) {
  const palette = {
    warm: { chip: "bg-warm-100 text-warm-600", bar: "bg-warm-400" },
    sage: { chip: "bg-sage-100 text-sage-600", bar: "bg-sage-400" },
    orange: { chip: "bg-orange-100 text-orange-700", bar: "bg-orange-400" },
    gray: { chip: "bg-cream-100 text-ink-400", bar: "bg-cream-200" },
  }[color];

  return (
    <div className="bg-cream-50 border-cream-100 rounded-xl border px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${palette.chip}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-ink-400 text-xs">{label}</div>
      </div>
      <div className="text-ink-800 text-base font-bold">
        {value}
        {total !== undefined && (
          <span className="text-ink-400 text-xs font-normal"> / {total}</span>
        )}
        {suffix && <span className="text-ink-400 ml-0.5 text-xs font-normal">{suffix}</span>}
        {pct !== undefined && (
          <span className="text-ink-400 ml-1.5 text-xs font-normal">({pct}%)</span>
        )}
      </div>
      {pct !== undefined && (
        <div className="bg-cream-100 mt-1.5 h-1 overflow-hidden rounded-full">
          <div className={`h-full ${palette.bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  suffix,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total?: number;
  suffix?: string;
  tone: "ink" | "sage" | "warm";
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
