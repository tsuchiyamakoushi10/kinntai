import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";

import { createOffice } from "../actions";
import { OfficeForm } from "../office-form";

export const dynamic = "force-dynamic";

export default async function NewOfficePage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/offices" className="hover:underline">
          拠点設定
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">新規追加</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">拠点を新規追加</h1>
      <OfficeForm
        action={createOffice}
        initial={{ code: "", name: "", address: "", isActive: true }}
        submitLabel="追加する"
      />
    </div>
  );
}
