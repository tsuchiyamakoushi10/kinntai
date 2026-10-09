/**
 * 労働条件通知書 3 枚の印刷画面。GET /admin/labor-notices/[id]/print
 *
 * 発行時に保存した snapshot から帳票 HTML を作り、開いたタブで印刷画面を出す。
 * PDF が欲しいときは印刷画面で「PDF に保存」を選ぶ。docs/labor-notice.md §1.1。
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { renderNoticeDocument } from "@/lib/labor-notice/html";
import type { NoticeView } from "@/lib/labor-notice/types";
import { printHtmlResponse } from "@/lib/print-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requireAdmin();
  const { id } = await params;
  const notice = await prisma.laborNotice.findUnique({
    where: { id },
    select: { noticeNo: true, snapshot: true, status: true },
  });
  if (!notice || notice.status === "DRAFT" || !notice.snapshot || !notice.noticeNo) {
    return NextResponse.json({ error: "発行済みの通知書が見つかりません。" }, { status: 404 });
  }

  return printHtmlResponse(
    renderNoticeDocument(notice.snapshot as unknown as NoticeView, {
      noticeNo: notice.noticeNo,
      preview: false,
    }),
  );
}
