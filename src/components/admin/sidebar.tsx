"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ATTENDANCE_ENABLED } from "@/lib/feature-flags";

type Item = {
  label: string;
  href: string;
};

type Section = {
  /** セクション見出し (省略時は見出しなしのトップ項目)。 */
  title?: string;
  items: Item[];
};

// MVP の管理者メニュー。関連する画面をセクションでまとめて迷わないようにする。
// - 梨花シフト / 自動作成 は単独メニューを廃止し、勤務表 (拠点切替・自動生成ボタン) から入る。
// - 勤怠 (打刻) は封印中のため ATTENDANCE_ENABLED が true のときだけ表示する。
const SECTIONS: Section[] = [
  {
    items: [
      { label: "ダッシュボード", href: "/admin" },
      { label: "従業員", href: "/admin/employees" },
    ],
  },
  {
    title: "シフト",
    items: [
      { label: "勤務表", href: "/admin/shifts" },
      { label: "シフト希望", href: "/admin/shift-preferences" },
      { label: "シフトパターン", href: "/admin/shift-patterns" },
      { label: "自動作成の設定", href: "/admin/shift-settings" },
      { label: "相談員チェック", href: "/admin/counselor-check" },
    ],
  },
  {
    title: "有給",
    items: [
      { label: "有給管理", href: "/admin/leave" },
      ...(ATTENDANCE_ENABLED ? [{ label: "勤怠", href: "/admin/attendance" }] : []),
    ],
  },
  {
    title: "設定",
    items: [
      { label: "会社情報", href: "/admin/company-profile" },
      { label: "拠点", href: "/admin/offices" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="管理メニュー" className="flex flex-col gap-3 p-3 text-sm">
      {SECTIONS.map((section, i) => (
        <div key={section.title ?? `top-${i}`} className="flex flex-col gap-1">
          {section.title && (
            <p className="px-3 pt-1 text-xs font-semibold tracking-wide text-slate-400">
              {section.title}
            </p>
          )}
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
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
        </div>
      ))}
    </nav>
  );
}
