"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ATTENDANCE_ENABLED } from "@/lib/feature-flags";

type Item = {
  label: string;
  href?: string;
  disabled?: boolean;
};

// MVP の管理者メニュー。href が無いものは「準備中」として disabled 表示。
// 勤怠 (打刻) は封印中のため ATTENDANCE_ENABLED が true のときだけ表示する。
const ITEMS: Item[] = [
  { label: "ダッシュボード", href: "/admin" },
  { label: "会社情報", href: "/admin/company-profile" },
  { label: "拠点設定", href: "/admin/offices" },
  { label: "従業員", href: "/admin/employees" },
  { label: "シフトパターン", href: "/admin/shift-patterns" },
  { label: "シフト枠", href: "/admin/quotas" },
  { label: "自動作成", href: "/admin/shifts/auto" },
  { label: "勤務表", href: "/admin/shifts" },
  { label: "シフト希望", href: "/admin/shift-preferences" },
  ...(ATTENDANCE_ENABLED ? [{ label: "勤怠", href: "/admin/attendance" }] : []),
  { label: "有給管理", href: "/admin/leave" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="管理メニュー" className="flex flex-col gap-1 p-3 text-sm">
      {ITEMS.map((item) => {
        if (item.disabled || !item.href) {
          return (
            <span
              key={item.label}
              className="flex items-center justify-between rounded-md px-3 py-2 text-slate-400"
            >
              <span>{item.label}</span>
              <span className="text-xs">準備中</span>
            </span>
          );
        }
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={
              active
                ? "rounded-md bg-slate-900 px-3 py-2 font-semibold text-white"
                : "rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
