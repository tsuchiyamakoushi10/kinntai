import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { nextContractInput, todayJst } from "@/lib/labor-notice/defaults";
import { loadNoticeMasters } from "@/lib/labor-notice/load";
import { parseNoticeInput } from "@/lib/labor-notice/parse";
import type { NoticeInput } from "@/lib/labor-notice/types";
import { applyRaiseToWage } from "@/lib/raise-notice/rows";
import type { RaiseView } from "@/lib/raise-notice/types";
import { toDateInputValue } from "@/lib/format";

import { loadEditorEmployees } from "../editor-data";
import { MissingCompany } from "../missing-company";
import { NoticeEditor } from "../notice-editor";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ employeeId?: string; from?: string; mode?: string }>;
};

/** S-A-31 労働条件通知書 作成。?from=<id>&mode=renew|indefinite|redo で前回の入力をコピーする */
export default async function NewLaborNoticePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const loaded = await loadNoticeMasters();
  if (!loaded) return <MissingCompany />;

  const today = todayJst();
  const employees = await loadEditorEmployees();

  let initialInput: NoticeInput | null = null;
  let employeeId = sp.employeeId ?? "";
  let replacesNoticeId: string | null = null;
  let heading = "労働条件通知書を作る";

  if (sp.from) {
    const from = await prisma.laborNotice.findUnique({
      where: { id: sp.from },
      select: {
        id: true,
        employeeId: true,
        status: true,
        input: true,
        contractEndOn: true,
        issuedAt: true,
      },
    });
    const prev = from ? parseNoticeInput(from.input) : null;
    if (from && prev) {
      employeeId = from.employeeId;
      if (sp.mode === "redo" && from.status === "VOID") {
        initialInput = { ...prev, issuedOn: today };
        replacesNoticeId = from.id;
        heading = "労働条件通知書を作り直す";
      } else if (from.contractEndOn && (sp.mode === "renew" || sp.mode === "indefinite")) {
        const mode = sp.mode === "renew" ? "RENEW" : "TO_INDEFINITE";
        // 前回の通知書の後に昇給通知を出していれば、新しい金額から始める
        const raises = from.issuedAt
          ? await prisma.raiseNotice.findMany({
              where: { employeeId: from.employeeId, createdAt: { gt: from.issuedAt } },
              orderBy: { createdAt: "asc" },
              select: { snapshot: true },
            })
          : [];
        const wage = raises.reduce((w, r) => {
          const v = r.snapshot as unknown as RaiseView;
          return applyRaiseToWage(w, v.kind, v.rows);
        }, prev.wage);
        initialInput = nextContractInput(
          { ...prev, wage },
          toDateInputValue(from.contractEndOn),
          mode,
          today,
        );
        heading = mode === "RENEW" ? "契約更新の通知書を作る" : "期間の定めなしの通知書を作る";
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/labor-notices" className="hover:underline">
          労働条件通知書
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">作成</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
      <NoticeEditor
        masters={loaded.masters}
        employees={employees}
        noticeId={null}
        replacesNoticeId={replacesNoticeId}
        initialEmployeeId={employeeId}
        initialInput={initialInput}
        lockEmployee={initialInput !== null}
        today={today}
      />
    </div>
  );
}
