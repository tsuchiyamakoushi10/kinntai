import { ManualList } from "@/components/manual-list";
import { requireAdmin } from "@/lib/auth-guard";

/** S-A-38 使い方 (管理者は職員向けも見られる) */
export default async function AdminManualPage() {
  await requireAdmin();

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">使い方</h1>
        <p className="mt-1 text-sm text-slate-600">
          マニュアルと操作の説明動画です。職員向けは、職員に使い方を教えるときにも使えます。
        </p>
      </div>
      <ManualList audiences={["admin", "staff"]} />
    </div>
  );
}
