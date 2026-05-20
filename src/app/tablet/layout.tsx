import type { ReactNode } from "react";

/**
 * 共有タブレット用レイアウト。
 *
 * 管理者 / 従業員レイアウトとは独立させ、サイドバー無しのフルスクリーン構成。
 * 横向き 1024×768 タブレットを主たる想定とし、文字とボタンを大きく取る。
 *
 * 認可は各ページ側で行う:
 *   - /tablet/setup     : 管理者ログイン必須（middleware で担保）
 *   - その他 /tablet/*  : 端末の拠点登録 cookie の有無で判定
 */
export const dynamic = "force-dynamic";

export default function TabletLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 text-slate-900">{children}</div>;
}
