import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { renderRaiseDocument } from "@/lib/raise-notice/html";
import type { RaiseView } from "@/lib/raise-notice/types";

import { RaiseArchiveButton, RaiseDeleteButton, RaiseSignedUploadForm } from "./raise-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** S-A-41 昇給通知 詳細 */
export default async function RaiseNoticeDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const notice = await prisma.raiseNotice.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, lastName: true, firstName: true } },
      office: { select: { name: true } },
      signedDocument: { select: { uploadedAt: true } },
    },
  });
  if (!notice) notFound();
  const view = notice.snapshot as unknown as RaiseView;
  const archived = notice.archivedAt !== null;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/raise-notices" className="hover:underline">
          昇給通知
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">
          {notice.employee.lastName} {notice.employee.firstName}
        </span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {notice.employee.lastName} {notice.employee.firstName} さん
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {notice.office.name}・{formatDate(notice.effectiveOn)}から新しい金額
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {notice.signedAt ? "署名済み" : "発行済み（署名待ち）"}
          {archived ? "（完了フォルダ）" : ""}
        </span>
      </header>

      <section className="flex flex-wrap gap-3">
        <a
          href={`/admin/raise-notices/${id}/print`}
          target="_blank"
          rel="noopener"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          印刷する（1枚）
        </a>
        <RaiseArchiveButton noticeId={id} archived={archived} />
        <RaiseDeleteButton noticeId={id} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {notice.signedDocument ? (
          <p className="text-sm text-slate-700">
            署名済みの受領書を登録済み（{formatDate(notice.signedDocument.uploadedAt)}）。
            <Link
              href={`/admin/employees/${notice.employee.id}?tab=documents`}
              className="ml-1 underline"
            >
              書類タブで見る
            </Link>
          </p>
        ) : (
          <RaiseSignedUploadForm noticeId={id} />
        )}
      </section>

      <iframe
        title="昇給通知書"
        srcDoc={renderRaiseDocument(view)}
        sandbox=""
        className="h-[80vh] w-full rounded-lg border border-slate-200 bg-slate-100"
      />
    </div>
  );
}
