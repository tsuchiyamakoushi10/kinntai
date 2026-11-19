"use client";

import NextLink from "next/link";
import { NavLink } from "@/yui/router";
import {
  Heart,
  Home,
  Users,
  ClipboardList,
  LogOut,
  Menu,
  X,
  FileText,
  ArrowLeftRight,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/yui/auth";
import type { Role } from "../types";

const ROLE_LABEL: Record<Role, string> = {
  staff: "職員モード",
  manager: "管理者モード",
  president: "社長モード",
};

const ROLE_STYLE: Record<Role, { bar: string; chip: string; accent: string }> = {
  staff: {
    bar: "bg-sage-50 border-sage-100",
    chip: "bg-sage-500 text-white",
    accent: "text-sage-600",
  },
  manager: {
    bar: "bg-warm-100 border-warm-200",
    chip: "bg-warm-300 text-warm-600",
    accent: "text-warm-600",
  },
  president: {
    bar: "bg-warm-500/10 border-warm-200",
    chip: "bg-warm-500 text-white",
    accent: "text-warm-600",
  },
};

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function Layout({
  homeHref,
  children,
}: {
  homeHref: string;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const items: NavItem[] = (() => {
    if (user.role === "staff") {
      return [
        { to: "/staff/home", label: "ホーム", icon: Home },
        { to: "/staff/interview", label: "面談シート", icon: FileText },
      ];
    }
    if (user.role === "manager") {
      return [
        { to: "/manager/home", label: "ホーム", icon: Home },
        { to: "/manager/staff-list", label: "部署職員一覧", icon: Users },
      ];
    }
    return [
      { to: "/president/home", label: "ホーム", icon: Home },
      { to: "/president/talent", label: "人材ダッシュボード", icon: LayoutDashboard },
      { to: "/president/staff", label: "全職員一覧", icon: Users },
      { to: "/president/hr-assessments", label: "人事考課確認", icon: ClipboardList },
      { to: "/president/review", label: "面談確認", icon: FileText },
      { to: "/president/settings", label: "設定", icon: Settings },
    ];
  })();

  const onLogout = () => {
    logout();
  };

  const style = ROLE_STYLE[user.role];

  return (
    <div className="bg-cream-50 flex min-h-screen flex-col md:flex-row">
      {/* モバイルヘッダー */}
      <header className="border-cream-200 sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Heart className="text-warm-500 h-6 w-6" />
          <span className="text-ink-800 font-bold">結いナビ</span>
        </div>
        <span className={`chip ${style.chip}`}>{ROLE_LABEL[user.role]}</span>
        <button
          aria-label="メニュー"
          className="hover:bg-cream-50 rounded-lg p-2"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* サイドバー */}
      <aside
        className={`${
          open ? "flex" : "hidden"
        } border-cream-200 w-full border-r bg-white md:flex md:min-h-screen md:w-64 md:min-w-64 md:flex-col`}
      >
        {/* ロゴ */}
        <div className="border-cream-200 hidden items-center gap-2 border-b px-6 py-6 md:flex">
          <Heart className="text-warm-500 h-7 w-7" />
          <div>
            <div className="text-ink-800 text-lg leading-tight font-bold">結いナビ</div>
            <div className="text-ink-400 text-[10px] tracking-wider">Cross Heart Growth System</div>
          </div>
        </div>

        {/* 現在のユーザー */}
        <div className="border-cream-200 border-b px-4 py-4">
          <div className="text-ink-400 mb-2 text-xs">現在ログイン中</div>
          <div className="flex items-center gap-2">
            <div className="bg-warm-100 text-warm-600 flex h-10 w-10 items-center justify-center rounded-full font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-ink-800 truncate text-sm font-medium">{user.name}</div>
              <div className="text-ink-400 truncate text-xs">{user.department}</div>
            </div>
          </div>
          <div className="mt-3">
            <span className={`chip ${style.chip}`}>{ROLE_LABEL[user.role]}</span>
          </div>
        </div>

        {/* メインナビ */}
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-warm-100 text-warm-600" : "text-ink-600 hover:bg-cream-50"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* CrossShift に戻る (結いナビの「モード切替（開発用）」の位置) */}
        <div className="border-cream-200 border-t px-3 py-3">
          <NextLink
            href={homeHref}
            className="text-ink-600 hover:bg-cream-50 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          >
            <ArrowLeftRight className="h-4 w-4" />
            CrossShift に戻る
          </NextLink>
        </div>

        {/* ログアウト */}
        <div className="border-cream-200 border-t p-3">
          <button
            onClick={onLogout}
            className="text-ink-400 hover:bg-cream-50 hover:text-ink-800 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* モード表示バー */}
        <div className={`border-b ${style.bar} sticky top-0 z-10 md:top-0`}>
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 text-sm md:px-8">
            <span className={`chip ${style.chip}`}>現在：{ROLE_LABEL[user.role]}</span>
            <span className={`font-medium ${style.accent}`}>{user.name}さん</span>
            <span className="text-ink-400 hidden md:inline">
              ／ {user.department}
              {user.role === "staff" && ` ／ ${user.jobType}`}
            </span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
