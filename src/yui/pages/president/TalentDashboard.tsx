"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import {
  Users,
  Crown,
  Award,
  AlertCircle,
  Wallet,
  Building2,
  BarChart3,
  TrendingUp,
  ChevronRight,
  Sparkles,
  Heart,
  ShieldAlert,
} from "lucide-react";
import { staffStore, presidentReviewStore, periodStore } from "@/yui/storage";
import type {
  Staff,
  PresidentReview,
  EvalRank,
  ExpectationLevel,
  DevelopmentRank,
} from "../../types";
import { GROWTH_STEP_OPTIONS, TALENT_POTENTIAL_OPTIONS } from "../../types";
import EvalBadge from "../../components/EvalBadge";

interface Row {
  staff: Staff;
  pr: PresidentReview | null;
}

// 並び順：総合評価 S>A>B>C、次に期待度 高>中>低（未設定は末尾）
const RANK_ORDER: Record<EvalRank, number> = { S: 0, A: 1, B: 2, C: 3 };
const EXP_ORDER: Record<ExpectationLevel, number> = { 高: 0, 中: 1, 低: 2 };

function yen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}

function signedYen(n: number): string {
  const sign = n > 0 ? "＋" : n < 0 ? "▲" : "±";
  return `${sign}${Math.abs(n).toLocaleString("ja-JP")}円`;
}

export default function TalentDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");

  useEffect(() => {
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    setPeriodLabel(period?.label ?? "");

    const reviews = presidentReviewStore.byPeriod(pk);
    const byStaff = new Map(reviews.map((r) => [r.staffId, r]));
    const staffs = staffStore.list().filter((s) => s.role === "staff" && s.active);
    setRows(staffs.map((s) => ({ staff: s, pr: byStaff.get(s.id) ?? null })));
  }, []);

  // ===== KPI / リスト =====
  const total = rows.length;
  const confirmed = useMemo(() => rows.filter((r) => r.pr?.status === "confirmed").length, [rows]);
  const managerCandidates = useMemo(
    () =>
      rows
        .filter((r) => r.pr?.isManagerCandidate === true)
        .sort((a, b) => {
          const ra = a.pr?.overallRank ? RANK_ORDER[a.pr.overallRank] : 9;
          const rb = b.pr?.overallRank ? RANK_ORDER[b.pr.overallRank] : 9;
          if (ra !== rb) return ra - rb;
          const ea = a.pr?.expectationLevel ? EXP_ORDER[a.pr.expectationLevel] : 9;
          const eb = b.pr?.expectationLevel ? EXP_ORDER[b.pr.expectationLevel] : 9;
          return ea - eb;
        }),
    [rows],
  );
  const priorityList = useMemo(
    () =>
      rows.filter(
        (r) => r.pr?.isPriorityDevelopment === true || r.pr?.developmentRank === "重点育成",
      ),
    [rows],
  );
  // 要フォロー：2区分を別表示（混同防止）
  const followByFlag = useMemo(() => rows.filter((r) => r.pr?.needsFollowUp === true), [rows]);
  const followByRank = useMemo(
    () => rows.filter((r) => r.pr?.developmentRank === "要フォロー"),
    [rows],
  );

  // ===== 分布 =====
  const overallDist = useMemo(() => {
    const c: Record<EvalRank, number> = { S: 0, A: 0, B: 0, C: 0 };
    let unset = 0;
    rows.forEach((r) => {
      const v = r.pr?.overallRank;
      if (v) c[v]++;
      else unset++;
    });
    return { c, unset };
  }, [rows]);

  const expDist = useMemo(() => {
    const c: Record<ExpectationLevel, number> = { 高: 0, 中: 0, 低: 0 };
    let unset = 0;
    rows.forEach((r) => {
      const v = r.pr?.expectationLevel;
      if (v) c[v]++;
      else unset++;
    });
    return { c, unset };
  }, [rows]);

  const devRankDist = useMemo(() => {
    const c: Record<DevelopmentRank, number> = {
      重点育成: 0,
      通常育成: 0,
      要フォロー: 0,
    };
    let unset = 0;
    rows.forEach((r) => {
      const v = r.pr?.developmentRank;
      if (v) c[v]++;
      else unset++;
    });
    return { c, unset };
  }, [rows]);

  const potentialDist = useMemo(() => {
    const c = new Map<string, number>();
    let unset = 0;
    rows.forEach((r) => {
      const v = r.pr?.talentPotential;
      if (v) c.set(v, (c.get(v) ?? 0) + 1);
      else unset++;
    });
    return { c, unset };
  }, [rows]);

  // 成長STEP構成（ピラミッド：STEP5 が上）
  const stepDist = useMemo(
    () =>
      [...GROWTH_STEP_OPTIONS].reverse().map((o) => ({
        value: o.value,
        label: o.label,
        count: rows.filter((r) => r.staff.growthStep === o.value).length,
      })),
    [rows],
  );

  // 部署別 危険度（管理者候補 / 重点育成 / 要フォロー）
  const byDept = useMemo(() => {
    const map = new Map<
      string,
      { total: number; managerCand: number; priority: number; follow: number }
    >();
    rows.forEach((r) => {
      const key = r.staff.department;
      const cur = map.get(key) ?? {
        total: 0,
        managerCand: 0,
        priority: 0,
        follow: 0,
      };
      cur.total++;
      if (r.pr?.isManagerCandidate === true) cur.managerCand++;
      if (r.pr?.isPriorityDevelopment === true || r.pr?.developmentRank === "重点育成")
        cur.priority++;
      if (r.pr?.needsFollowUp === true || r.pr?.developmentRank === "要フォロー") cur.follow++;
      map.set(key, cur);
    });
    return Array.from(map.entries());
  }, [rows]);

  // 将来候補職別
  const byFutureRole = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const v = r.pr?.futureCandidateRole?.trim();
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // ===== 報酬サマリー（経営判断） =====
  const comp = useMemo(() => {
    let raiseCount = 0;
    let raiseTotal = 0;
    let bonusCount = 0;
    let bonusCurrentTotal = 0;
    let bonusPrevTotal = 0;
    rows.forEach((r) => {
      const p = r.pr;
      if (!p) return;
      if (p.prevBaseSalary != null && p.currentBaseSalary != null) {
        const d = p.currentBaseSalary - p.prevBaseSalary;
        if (d > 0) {
          raiseCount++;
          raiseTotal += d;
        }
      }
      if (p.currentBonus != null) {
        bonusCount++;
        bonusCurrentTotal += p.currentBonus;
      }
      if (p.prevBonus != null) bonusPrevTotal += p.prevBonus;
    });
    return {
      raiseCount,
      raiseTotal,
      annualImpact: raiseTotal * 12,
      bonusCount,
      bonusCurrentTotal,
      bonusPrevTotal,
      bonusDiff: bonusCurrentTotal - bonusPrevTotal,
    };
  }, [rows]);

  return (
    <>
      {/* ヘッダー */}
      <section className="mb-5">
        <div className="text-warm-500 mb-1 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          <span className="text-xs font-bold tracking-[0.2em]">TALENT DASHBOARD</span>
        </div>
        <h1 className="text-ink-800 text-2xl font-bold tracking-tight md:text-3xl">
          人材ダッシュボード
        </h1>
        <p className="text-ink-400 mt-1 text-sm">
          全社の育成状況・候補人材・報酬判断を俯瞰 ／ {periodLabel || "—"}
        </p>
      </section>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={Users} label="対象職員" value={total} suffix="名" tone="ink" />
        <KpiCard icon={BarChart3} label="社長確認済" value={confirmed} total={total} tone="sage" />
        <KpiCard
          icon={Crown}
          label="管理者候補"
          value={managerCandidates.length}
          suffix="名"
          tone="warm"
        />
        <KpiCard
          icon={Award}
          label="重点育成"
          value={priorityList.length}
          suffix="名"
          tone="warm"
        />
        <KpiCard
          icon={AlertCircle}
          label="要フォロー"
          value={followByFlag.length + followByRank.length}
          suffix="名"
          tone="orange"
        />
      </div>

      {/* 分布 */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="card">
          <h2 className="text-ink-800 mb-4 text-base font-bold">総合評価分布（社長）</h2>
          <div className="space-y-3">
            {(["S", "A", "B", "C"] as EvalRank[]).map((rank) => (
              <div key={rank} className="flex items-center gap-3">
                <EvalBadge rank={rank} />
                <DistBar value={overallDist.c[rank]} total={total} tone="warm" />
                <div className="text-ink-800 w-10 text-right text-sm font-medium">
                  {overallDist.c[rank]}名
                </div>
              </div>
            ))}
            <UnsetNote n={overallDist.unset} />
          </div>
        </div>

        <div className="card">
          <h2 className="text-ink-800 mb-4 text-base font-bold">社長期待度</h2>
          <div className="space-y-3">
            {(["高", "中", "低"] as ExpectationLevel[]).map((lv) => (
              <div key={lv} className="flex items-center gap-3">
                <span className="chip bg-cream-100 text-ink-600 w-8 justify-center">{lv}</span>
                <DistBar value={expDist.c[lv]} total={total} tone="sage" />
                <div className="text-ink-800 w-10 text-right text-sm font-medium">
                  {expDist.c[lv]}名
                </div>
              </div>
            ))}
            <UnsetNote n={expDist.unset} />
          </div>
        </div>

        <div className="card">
          <h2 className="text-ink-800 mb-4 text-base font-bold">育成ランク</h2>
          <div className="space-y-3">
            {(["重点育成", "通常育成", "要フォロー"] as DevelopmentRank[]).map((dr) => (
              <div key={dr} className="flex items-center gap-3">
                <span className="text-ink-600 w-16 shrink-0 text-xs">{dr}</span>
                <DistBar value={devRankDist.c[dr]} total={total} tone="warm" />
                <div className="text-ink-800 w-10 text-right text-sm font-medium">
                  {devRankDist.c[dr]}名
                </div>
              </div>
            ))}
            <UnsetNote n={devRankDist.unset} />
          </div>
        </div>

        <div className="card">
          <h2 className="text-ink-800 mb-4 text-base font-bold">人材ポテンシャル</h2>
          <div className="space-y-2.5">
            {TALENT_POTENTIAL_OPTIONS.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <span className="text-ink-600 w-24 shrink-0 text-xs">{p}</span>
                <DistBar value={potentialDist.c.get(p) ?? 0} total={total} tone="warm" />
                <div className="text-ink-800 w-10 text-right text-sm font-medium">
                  {potentialDist.c.get(p) ?? 0}名
                </div>
              </div>
            ))}
            <UnsetNote n={potentialDist.unset} />
          </div>
        </div>
      </div>

      {/* 人材構成 */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-ink-800 mb-4 flex items-center gap-2 text-base font-bold">
            <Sparkles className="text-warm-500 h-4 w-4" />
            成長STEP構成
          </h2>
          <div className="space-y-2">
            {stepDist.map((s) => (
              <div key={s.value} className="flex items-center gap-3">
                <span className="text-ink-600 w-12 shrink-0 text-xs font-bold">{s.value}</span>
                <DistBar value={s.count} total={total} tone="sage" />
                <div className="text-ink-800 w-10 text-right text-sm font-medium">{s.count}名</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-ink-800 mb-1 flex items-center gap-2 text-base font-bold">
            <Building2 className="text-warm-500 h-4 w-4" />
            部署別 危険度
          </h2>
          <p className="text-ink-400 mb-4 text-xs">
            管理者候補が0名で重点育成/要フォローがいる部署を「後継者不在」として警告します。
          </p>
          <div className="space-y-2">
            {byDept.map(([dept, v]) => {
              const danger = v.total > 0 && v.managerCand === 0 && (v.priority > 0 || v.follow > 0);
              return (
                <div
                  key={dept}
                  className={`rounded-xl border p-3 ${
                    danger ? "border-orange-200 bg-orange-50" : "border-cream-100 bg-white"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-ink-800 min-w-0 truncate text-sm font-medium">
                      {dept}
                      <span className="text-ink-400 ml-1.5 text-xs">{v.total}名</span>
                    </span>
                    {danger && (
                      <span className="chip shrink-0 bg-orange-500 text-white">
                        <AlertCircle className="h-3 w-3" />
                        後継者不在
                      </span>
                    )}
                  </div>
                  <div className="text-ink-600 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      管理者候補{" "}
                      <b className={v.managerCand === 0 ? "text-orange-600" : "text-ink-800"}>
                        {v.managerCand}
                      </b>
                      名
                    </span>
                    <span>
                      重点育成 <b className="text-ink-800">{v.priority}</b>名
                    </span>
                    <span>
                      要フォロー{" "}
                      <b className={v.follow > 0 ? "text-warm-600" : "text-ink-800"}>{v.follow}</b>
                      名
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 候補人材リスト */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 管理者候補（総合評価順） */}
        <div className="card">
          <h2 className="text-ink-800 mb-1 flex items-center gap-2 text-base font-bold">
            <Crown className="text-warm-500 h-4 w-4" />
            管理者候補一覧
          </h2>
          <p className="text-ink-400 mb-4 text-xs">総合評価（S→C）・期待度（高→低）順</p>
          {managerCandidates.length === 0 ? (
            <EmptyNote text="管理者候補に設定された職員はいません" />
          ) : (
            <div className="space-y-2">
              {managerCandidates.map((r) => (
                <PersonLink key={r.staff.id} staff={r.staff}>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.pr?.overallRank && <EvalBadge rank={r.pr.overallRank} />}
                    {r.pr?.expectationLevel && (
                      <span className="chip bg-warm-100 text-warm-600">
                        期待度{r.pr.expectationLevel}
                      </span>
                    )}
                  </div>
                </PersonLink>
              ))}
            </div>
          )}
        </div>

        {/* 将来候補職別 */}
        <div className="card">
          <h2 className="text-ink-800 mb-4 flex items-center gap-2 text-base font-bold">
            <TrendingUp className="text-warm-500 h-4 w-4" />
            将来候補職 別
          </h2>
          {byFutureRole.length === 0 ? (
            <EmptyNote text="将来候補職が入力された職員はいません" />
          ) : (
            <div className="space-y-2">
              {byFutureRole.map(([role, n]) => (
                <div
                  key={role}
                  className="border-cream-100 flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0"
                >
                  <span className="text-ink-800 font-medium">{role}</span>
                  <span className="text-ink-400">{n}名</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 重点育成一覧（不足能力・次に任せる業務を重視） */}
      <div className="card mb-6">
        <h2 className="text-ink-800 mb-4 flex items-center gap-2 text-base font-bold">
          <Award className="text-warm-500 h-4 w-4" />
          重点育成一覧
        </h2>
        {priorityList.length === 0 ? (
          <EmptyNote text="重点育成対象の職員はいません" />
        ) : (
          <div className="space-y-3">
            {priorityList.map((r) => (
              <Link
                key={r.staff.id}
                to={`/president/staff/${r.staff.id}`}
                className="border-cream-200 hover:border-warm-300 block rounded-xl border p-3 transition"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-ink-800 font-medium">{r.staff.name}</span>
                    <span className="text-ink-400 ml-2 text-xs">{r.staff.department}</span>
                  </div>
                  <ChevronRight className="text-ink-400 h-4 w-4 shrink-0" />
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm md:grid-cols-2">
                  <KeyVal label="不足している能力" value={r.pr?.lackingSkills} />
                  <KeyVal label="次に任せる業務" value={r.pr?.nextAssignments} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 要フォロー（2区分を別表示） */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-ink-800 mb-1 flex items-center gap-2 text-base font-bold">
            <AlertCircle className="text-warm-500 h-4 w-4" />
            要フォロー（要フォロー判定）
          </h2>
          <p className="text-ink-400 mb-4 text-xs">注意・支援が必要な職員（needsFollowUp）</p>
          {followByFlag.length === 0 ? (
            <EmptyNote text="該当する職員はいません" />
          ) : (
            <div className="space-y-2">
              {followByFlag.map((r) => (
                <Link
                  key={r.staff.id}
                  to={`/president/staff/${r.staff.id}`}
                  className="border-warm-100 bg-warm-50 hover:border-warm-300 block rounded-xl border p-3 transition"
                >
                  <div className="text-ink-800 font-medium">{r.staff.name}</div>
                  <div className="text-ink-400 text-xs">{r.staff.department}</div>
                  {r.pr?.followUpReason && (
                    <div className="text-ink-600 mt-1.5 text-sm leading-relaxed">
                      {r.pr.followUpReason}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-ink-800 mb-1 flex items-center gap-2 text-base font-bold">
            <ShieldAlert className="text-sage-600 h-4 w-4" />
            要フォロー（育成ランク）
          </h2>
          <p className="text-ink-400 mb-4 text-xs">
            育成上、継続的に見ていく職員（育成ランク＝要フォロー）
          </p>
          {followByRank.length === 0 ? (
            <EmptyNote text="該当する職員はいません" />
          ) : (
            <div className="space-y-2">
              {followByRank.map((r) => (
                <Link
                  key={r.staff.id}
                  to={`/president/staff/${r.staff.id}`}
                  className="border-sage-100 bg-sage-50 hover:border-sage-300 block rounded-xl border p-3 transition"
                >
                  <div className="text-ink-800 font-medium">{r.staff.name}</div>
                  <div className="text-ink-400 text-xs">{r.staff.department}</div>
                  {r.pr?.developmentPolicy && (
                    <div className="text-ink-600 mt-1.5 text-sm leading-relaxed">
                      {r.pr.developmentPolicy}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 報酬サマリー（経営判断） */}
      <div className="card from-warm-50 to-cream-50 border-warm-100 bg-gradient-to-br">
        <h2 className="text-ink-800 mb-1 flex items-center gap-2 text-base font-bold">
          <Wallet className="text-warm-500 h-4 w-4" />
          報酬サマリー（経営判断）
        </h2>
        <p className="text-ink-400 mb-4 text-xs">
          社長判断で入力済みの金額のみ集計。差額は表示のみ（保存しません）。
        </p>
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
          <CompStat label="昇給対象人数" value={`${comp.raiseCount}名`} />
          <CompStat label="総昇給額（月額）" value={signedYen(comp.raiseTotal)} accent />
          <CompStat label="年間人件費増" value={signedYen(comp.annualImpact)} accent />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <CompStat label="賞与対象人数" value={`${comp.bonusCount}名`} />
          <CompStat label="今回賞与総額" value={yen(comp.bonusCurrentTotal)} />
          <CompStat label="前回賞与総額" value={yen(comp.bonusPrevTotal)} />
          <CompStat label="賞与増減額" value={signedYen(comp.bonusDiff)} accent />
        </div>
      </div>
    </>
  );
}

// ===== 小コンポーネント =====
function KpiCard({
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
  tone: "ink" | "sage" | "warm" | "orange";
}) {
  const toneStyle = {
    ink: "bg-cream-100 text-ink-600",
    sage: "bg-sage-100 text-sage-600",
    warm: "bg-warm-100 text-warm-600",
    orange: "bg-orange-100 text-orange-700",
  }[tone];
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

function DistBar({ value, total, tone }: { value: number; total: number; tone: "warm" | "sage" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const bar = tone === "warm" ? "bg-warm-400" : "bg-sage-400";
  return (
    <div className="bg-cream-100 h-2 flex-1 overflow-hidden rounded-full">
      <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function UnsetNote({ n }: { n: number }) {
  if (n <= 0) return null;
  return <div className="text-ink-400 pt-1 text-xs">未設定 {n}名</div>;
}

function EmptyNote({ text }: { text: string }) {
  return <div className="text-ink-400 py-6 text-center text-sm">{text}</div>;
}

function PersonLink({ staff, children }: { staff: Staff; children?: React.ReactNode }) {
  return (
    <Link
      to={`/president/staff/${staff.id}`}
      className="border-cream-200 hover:border-warm-300 flex items-center justify-between gap-2 rounded-xl border p-3 transition"
    >
      <div className="min-w-0">
        <div className="text-ink-800 truncate font-medium">{staff.name}</div>
        <div className="text-ink-400 truncate text-xs">
          {staff.department}
          {staff.position ? ` ／ ${staff.position}` : ""}
        </div>
      </div>
      {children}
    </Link>
  );
}

function KeyVal({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span className="text-ink-400 text-xs">{label}：</span>
      <span className="text-ink-800">{value?.trim() || "—"}</span>
    </div>
  );
}

function CompStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-cream-100 rounded-xl border bg-white px-3 py-2.5">
      <div className="text-ink-400 mb-1 text-xs">{label}</div>
      <div className={`font-bold ${accent ? "text-warm-600 text-lg" : "text-ink-800 text-base"}`}>
        {value}
      </div>
    </div>
  );
}
