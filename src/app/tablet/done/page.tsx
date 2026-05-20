import { redirect } from "next/navigation";

import { ACTION_LABELS, type PunchAction } from "@/lib/attendance/punch";
import { getTabletOfficeId } from "@/lib/tablet/session";

import { TabletDoneAutoRedirect } from "./auto-redirect";

const PUNCH_ACTIONS = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"] as const;

function isPunchAction(v: unknown): v is PunchAction {
  return typeof v === "string" && (PUNCH_ACTIONS as readonly string[]).includes(v);
}

type PageProps = {
  searchParams: Promise<{ action?: string }>;
};

/**
 * S-T-05 打刻完了。
 *
 * 「<種別> しました」を 3 秒だけ表示し、本人選択 (S-T-02) に自動で戻す。
 * JavaScript 無効でも遷移できるよう <meta http-equiv="refresh"> も併用する。
 */
export default async function TabletDonePage({ searchParams }: PageProps) {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const { action } = await searchParams;
  const label = isPunchAction(action) ? ACTION_LABELS[action] : "打刻";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <meta httpEquiv="refresh" content="3; url=/tablet" />
      <div className="size-24 rounded-full bg-emerald-100 p-5 text-emerald-700">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="size-full"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </div>
      <p className="text-3xl font-bold text-slate-900">{label}しました</p>
      <p className="text-sm text-slate-600">この画面は 3 秒後に自動で戻ります</p>
      <TabletDoneAutoRedirect href="/tablet" delayMs={3000} />
    </div>
  );
}
