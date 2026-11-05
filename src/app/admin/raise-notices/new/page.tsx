import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { todayJst } from "@/lib/labor-notice/defaults";
import { loadNoticeMasters } from "@/lib/labor-notice/load";

import { MissingCompany } from "../../labor-notices/missing-company";
import { loadRaiseEmployees } from "../editor-data";
import { RaiseEditor } from "../raise-editor";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ employeeId?: string }> };

/** S-A-40 昇給通知 作成。?employeeId= で従業員を選んだ状態で開く */
export default async function NewRaiseNoticePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const loaded = await loadNoticeMasters();
  if (!loaded) return <MissingCompany title="昇給通知" />;
  const employees = await loadRaiseEmployees(loaded.masters);
  const { company } = loaded.masters;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/raise-notices" className="hover:underline">
          昇給通知
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">作成</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">昇給通知を作る</h1>
      <RaiseEditor
        employees={employees}
        initialEmployeeId={
          employees.some((e) => e.id === sp.employeeId) ? (sp.employeeId ?? "") : ""
        }
        company={{
          name: company.name,
          address: company.address,
          representative: company.representative,
        }}
        today={todayJst()}
      />
    </div>
  );
}
