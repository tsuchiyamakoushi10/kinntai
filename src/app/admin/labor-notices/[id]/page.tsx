import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { renderNoticeDocument } from "@/lib/labor-notice/html";
import type { NoticeInput, NoticeView } from "@/lib/labor-notice/types";

import { deleteLaborNoticeDraft } from "../actions";
import { STATUS_LABEL, TYPE_LABEL } from "../labels";
import { SignedUploadForm, VoidButton } from "./notice-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

type Ack = { code: string; message: string; reason: string; acknowledgedAt: string };

/** S-A-32 労働条件通知書 詳細 */
export default async function LaborNoticeDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const notice = await prisma.laborNotice.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, lastName: true, firstName: true } },
      office: { select: { name: true } },
      signedDocument: { select: { id: true, uploadedAt: true } },
    },
  });
  if (!notice) notFound();

  const view = notice.snapshot as unknown as NoticeView | null;
  const input = notice.input as unknown as NoticeInput;
  const acks = (notice.acknowledgements as unknown as Ack[] | null) ?? [];
  const isIssued = notice.status === "ISSUED" || notice.status === "SIGNED";
  const fixed = notice.contractEndOn !== null;
  const canConvert = isIssued && fixed && input.employmentType === "PART_TIME";

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/labor-notices" className="hover:underline">
          労働条件通知書
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{notice.noticeNo ?? "下書き"}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {notice.employee.lastName} {notice.employee.firstName} さん
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {TYPE_LABEL[notice.noticeType]}・{notice.office.name}・
            {formatDate(notice.contractStartOn)}〜
            {notice.contractEndOn ? formatDate(notice.contractEndOn) : "（期間の定めなし）"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {STATUS_LABEL[notice.status]}
          {notice.noticeNo ? `　${notice.noticeNo}` : ""}
        </span>
      </header>

      <section className="flex flex-wrap gap-3">
        {notice.status === "DRAFT" && (
          <>
            <Link
              href={`/admin/labor-notices/${id}/edit`}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              続きを入力する
            </Link>
            <form action={deleteLaborNoticeDraft.bind(null, id)}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                下書きを削除
              </button>
            </form>
          </>
        )}
        {notice.status !== "DRAFT" && (
          <a
            href={`/admin/labor-notices/${id}/print`}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            印刷する（3枚）
          </a>
        )}
        {isIssued && fixed && !canConvert && (
          <Link
            href={`/admin/labor-notices/new?from=${id}&mode=renew`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            更新の通知書を作る
          </Link>
        )}
        {canConvert && (
          <Link
            href={`/admin/labor-notices/new?from=${id}&mode=indefinite`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            期間の定めなしの通知書を作る
          </Link>
        )}
        {notice.status === "VOID" && (
          <Link
            href={`/admin/labor-notices/new?from=${id}&mode=redo`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            作り直す
          </Link>
        )}
        {isIssued && <VoidButton noticeId={id} />}
      </section>

      {isIssued && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          {notice.signedDocument ? (
            <p className="text-sm text-slate-700">
              署名済みの3枚目を登録済み（{formatDate(notice.signedDocument.uploadedAt)}）。
              <Link
                href={`/admin/employees/${notice.employee.id}?tab=documents`}
                className="ml-1 underline"
              >
                書類タブで見る
              </Link>
            </p>
          ) : (
            <SignedUploadForm noticeId={id} />
          )}
        </section>
      )}

      {acks.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="font-semibold">発行時に確認した注意</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {acks.map((a) => (
              <li key={a.code}>
                {a.message}
                <br />
                <span className="text-amber-800">理由: {a.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view && (
        <iframe
          title="労働条件通知書"
          srcDoc={renderNoticeDocument(view, { noticeNo: notice.noticeNo, preview: false })}
          sandbox=""
          className="h-[80vh] w-full rounded-lg border border-slate-200 bg-slate-100"
        />
      )}
    </div>
  );
}
