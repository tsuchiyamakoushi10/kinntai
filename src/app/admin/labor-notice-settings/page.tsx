import { requireAdmin } from "@/lib/auth-guard";
import { loadNoticeSettings } from "@/lib/labor-notice/load";

import { SettingsEditor } from "./settings-editor";

export const dynamic = "force-dynamic";

/** S-A-34 労働条件通知書の設定。docs/labor-notice.md §2.1 */
export default async function LaborNoticeSettingsPage() {
  await requireAdmin();
  const settings = await loadNoticeSettings();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">労働条件通知書の設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          通知書を作るときに最初から入っている内容を変更できます。発行済みの通知書は変わりません。
        </p>
      </header>
      <SettingsEditor
        presets={settings.presets}
        patterns={settings.patterns}
        minWages={settings.minWages}
        savedPresets={settings.saved.presets}
      />
    </div>
  );
}
