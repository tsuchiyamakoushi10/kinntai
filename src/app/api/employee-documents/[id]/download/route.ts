/**
 * 書類ダウンロード API。
 *
 * セキュリティ:
 * - 管理者ログイン必須 (`requireAdmin`)。
 * - URL に `?token=<HMAC 署名>` を要求する。固定 URL を画面に出さないための仕組みで、
 *   ページを再描画すると新しいトークンが発行される。
 * - 5 分の TTL で expired は 410 Gone。
 * - 削除済み (`deleted_at != null`) も 410 Gone。
 * - 別従業員の書類への URL 改ざんは 404 で弾く (token の document_id とパスが一致しないため)。
 * - 成功時は `document_access_logs` に DOWNLOAD アクションを記録する。
 */
import { DocumentAccessAction } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { getObjectStorage, verifySignedToken } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireAdmin();
  const userId = session.user.id;
  const { id: documentId } = await params;

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const verification = verifySignedToken(token);
  if (!verification.ok) {
    const status = verification.reason === "expired" ? 410 : 403;
    return NextResponse.json({ error: verification.reason }, { status });
  }
  if (verification.documentId !== documentId) {
    return NextResponse.json({ error: "document mismatch" }, { status: 404 });
  }

  const doc = await prisma.employeeDocument.findUnique({
    where: { id: documentId },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.deletedAt !== null) return NextResponse.json({ error: "deleted" }, { status: 410 });

  const stored = await getObjectStorage().get(doc.storageKey);
  if (!stored) return NextResponse.json({ error: "missing in storage" }, { status: 410 });

  await prisma.documentAccessLog.create({
    data: {
      documentId: doc.id,
      userId,
      action: DocumentAccessAction.DOWNLOAD,
      ipAddress: extractClientIp(req),
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const filenameStar = `UTF-8''${encodeURIComponent(doc.fileName)}`;
  return new NextResponse(new Uint8Array(stored.body), {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(stored.body.length),
      "Content-Disposition": `attachment; filename*=${filenameStar}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function extractClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return null;
}
