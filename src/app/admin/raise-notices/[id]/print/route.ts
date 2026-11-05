/**
 * 昇給通知書の印刷画面。GET /admin/raise-notices/[id]/print
 *
 * 発行時に保存した snapshot から帳票 HTML を作り、開いたタブで印刷画面を出す。
 * PDF が欲しいときは印刷画面で「PDF に保存」を選ぶ。
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { printHtmlResponse } from "@/lib/print-html";
import { renderRaiseDocument } from "@/lib/raise-notice/html";
import type { RaiseView } from "@/lib/raise-notice/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requireAdmin();
  const { id } = await params;
  const notice = await prisma.raiseNotice.findUnique({ where: { id }, select: { snapshot: true } });
  if (!notice) {
    return NextResponse.json({ error: "昇給通知が見つかりません。" }, { status: 404 });
  }
  return printHtmlResponse(renderRaiseDocument(notice.snapshot as unknown as RaiseView));
}
