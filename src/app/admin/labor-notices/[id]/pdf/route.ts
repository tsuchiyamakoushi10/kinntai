/**
 * 労働条件通知書 3 枚の PDF。GET /admin/labor-notices/[id]/pdf
 *
 * 発行時に保存した snapshot から毎回生成する (PDF ファイルは保存しない)。
 * docs/labor-notice.md §1.1。
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { renderHtmlToPdf } from "@/lib/employment-contract/pdf";
import { renderNoticeDocument } from "@/lib/labor-notice/html";
import type { NoticeView } from "@/lib/labor-notice/types";

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

  const html = renderNoticeDocument(notice.snapshot as unknown as NoticeView, {
    noticeNo: notice.noticeNo,
    preview: false,
  });
  const pdf = await renderHtmlToPdf(html, {
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  // ファイル名に氏名を入れない (PII をダウンロード履歴・ログに残さない)
  const filename = `労働条件通知書_${notice.noticeNo}${notice.status === "VOID" ? "_無効" : ""}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
