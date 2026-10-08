import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { todayJst } from "@/lib/labor-notice/defaults";
import { loadNoticeMasters } from "@/lib/labor-notice/load";
import { parseNoticeInput } from "@/lib/labor-notice/parse";

import { loadEditorEmployees } from "../../editor-data";
import { MissingCompany } from "../../missing-company";
import { NoticeEditor } from "../../notice-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** 下書きの編集 (S-A-31)。発行済みは編集できないので詳細へ戻す */
export default async function EditLaborNoticePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const notice = await prisma.laborNotice.findUnique({
    where: { id },
    select: { id: true, status: true, employeeId: true, input: true },
  });
  if (!notice) notFound();
  if (notice.status !== "DRAFT") redirect(`/admin/labor-notices/${id}`);

  const loaded = await loadNoticeMasters();
  if (!loaded) return <MissingCompany />;
  const employees = await loadEditorEmployees();

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/labor-notices" className="hover:underline">
          労働条件通知書
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">下書き</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">労働条件通知書（下書き）</h1>
      <NoticeEditor
        masters={loaded.masters}
        employees={employees}
        noticeId={notice.id}
        replacesNoticeId={null}
        initialEmployeeId={notice.employeeId}
        initialInput={parseNoticeInput(notice.input)}
        lockEmployee
        today={todayJst()}
      />
    </div>
  );
}
