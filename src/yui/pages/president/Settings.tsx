"use client";

import { Link } from "@/yui/router";
import {
  Users,
  ChevronRight,
  Building2,
  Briefcase,
  GraduationCap,
  Sparkles,
  Crown,
  CalendarRange,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";

export default function Settings() {
  return (
    <>
      <PageHeader title="設定" subtitle="基本マスター情報を管理します" />

      <div className="space-y-3">
        {/* 社長アカウント設定 */}
        <Link
          to="/president/settings/account"
          className="card hover:bg-cream-50 flex items-center gap-4 transition"
        >
          <div className="bg-warm-100 text-warm-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Crown className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-800 text-base font-bold">社長アカウント設定</div>
            <div className="text-ink-400 mt-0.5 text-sm">
              ログイン画面に表示される社長情報を編集します
            </div>
          </div>
          <ChevronRight className="text-ink-400 h-5 w-5 shrink-0" />
        </Link>

        {/* 管理者マスター（今回実装） */}
        <Link
          to="/president/settings/admins"
          className="card hover:bg-cream-50 flex items-center gap-4 transition"
        >
          <div className="bg-warm-100 text-warm-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-800 text-base font-bold">管理者マスター</div>
            <div className="text-ink-400 mt-0.5 text-sm">管理者の登録・編集を行います</div>
          </div>
          <ChevronRight className="text-ink-400 h-5 w-5 shrink-0" />
        </Link>

        {/* 評価期間 (CrossShift 追加) */}
        <Link
          to="/president/settings/periods"
          className="card hover:bg-cream-50 flex items-center gap-4 transition"
        >
          <div className="bg-warm-100 text-warm-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-800 text-base font-bold">評価期間</div>
            <div className="text-ink-400 mt-0.5 text-sm">
              面談・人事考課の半期を追加し、いまの期間を切り替えます
            </div>
          </div>
          <ChevronRight className="text-ink-400 h-5 w-5 shrink-0" />
        </Link>

        {/* 今後対応予定（非活性） */}
        <div className="text-ink-400 px-1 pt-4 text-[10px] font-semibold tracking-wider uppercase">
          今後対応予定
        </div>
        {COMING_SOON.map((m) => (
          <div key={m.label} className="card flex cursor-not-allowed items-center gap-4 opacity-50">
            <div className="bg-cream-100 text-ink-400 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <m.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-ink-600 text-base font-bold">{m.label}</div>
              <div className="text-ink-400 mt-0.5 text-sm">準備中</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const COMING_SOON = [
  { label: "部署マスター", icon: Building2 },
  { label: "職種マスター", icon: Briefcase },
  { label: "雇用形態マスター", icon: Briefcase },
  { label: "資格マスター", icon: GraduationCap },
  { label: "成長STEPマスター", icon: Sparkles },
];
