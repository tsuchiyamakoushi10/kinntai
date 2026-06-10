"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ATTENDANCE_ENABLED } from "@/lib/feature-flags";

type Item = {
  label: string;
  href: string;
};

type Section = {
  /** セクション見出し (省略時は見出しなしのトップ項目)。 */
  title?: string;
  items: Item[];
  /** true = 折りたたみ可能。普段は閉じておき、配下のページにいる時だけ自動で開く。 */
  collapsible?: boolean;
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
    // 日常的に使うシフト操作だけを上に置く。マスター系 (パターン・自動作成の設定) は
    // 普段触らないため「設定」へ寄せ、メニューを浅く保つ (CLAUDE.md §3.1)。
    title: "シフト",
    items: [
      { label: "勤務表", href: "/admin/shifts" },
      { label: "シフト希望", href: "/admin/shift-preferences" },
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
    // 設定 (マスター系) は普段触らないため既定で隠す。設定ページを開いている間だけ自動展開する。
    title: "設定",
    collapsible: true,
    items: [
      { label: "会社情報", href: "/admin/company-profile" },
      { label: "拠点", href: "/admin/offices" },
      { label: "シフトパターン", href: "/admin/shift-patterns" },
      { label: "自動作成の設定", href: "/admin/shift-settings" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass = (active: boolean): string =>
  [
    "group flex items-center rounded-lg px-3 py-2 text-[13px] transition-colors",
    active
      ? "bg-slate-900 font-semibold text-white shadow-sm"
      : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");

const headingClass = "px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="管理メニュー" className="flex flex-col gap-5 p-3 pt-4">
      {SECTIONS.map((section, i) =>
        section.collapsible ? (
          <CollapsibleSection key={section.title} section={section} pathname={pathname} />
        ) : (
          <div key={section.title ?? `top-${i}`} className="flex flex-col gap-1">
            {section.title && <p className={`mb-1 ${headingClass}`}>{section.title}</p>}
            {section.items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={linkClass(isActive(pathname, item.href))}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ),
      )}
    </nav>
  );
}

function CollapsibleSection({ section, pathname }: { section: Section; pathname: string }) {
  const childActive = section.items.some((it) => isActive(pathname, it.href));
  const [open, setOpen] = useState(false);
  // 設定ページを開いている間は常に展開 (アクティブ項目を隠さない)。
  const expanded = open || childActive;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className={`mb-1 flex items-center justify-between rounded-md py-1 ${headingClass} transition-colors hover:text-slate-600`}
      >
        <span>{section.title}</span>
        <Chevron open={expanded} />
      </button>
      {expanded &&
        section.items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={linkClass(isActive(pathname, item.href))}
          >
            {item.label}
          </Link>
        ))}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={`size-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M7 4.5a.75.75 0 0 1 1.28-.53l5 5a.75.75 0 0 1 0 1.06l-5 5A.75.75 0 0 1 7 14.5v-10Z" />
    </svg>
  );
}
