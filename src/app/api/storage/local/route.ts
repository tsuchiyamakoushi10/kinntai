/**
 * 開発用: ローカル FS ストレージへの署名つきアップロード / 読み出し。
 *
 * 本番 (Supabase Storage) ではブラウザが Supabase の署名つき URL を直接使うため、
 * この API は使わない (Supabase が設定されていれば 404)。
 * 署名は `LocalFileStorage.createUploadUrl` / `createDownloadUrl` が発行する。
 */
import { type NextRequest, NextResponse } from "next/server";

import { getObjectStorage, LocalFileStorage, verifySignedToken } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_LOCAL_UPLOAD_BYTES = 25 * 1024 * 1024;

function check(req: NextRequest, action: "put" | "get"): string | NextResponse {
  if (!(getObjectStorage() instanceof LocalFileStorage)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const key = req.nextUrl.searchParams.get("key");
  const token = req.nextUrl.searchParams.get("token");
  if (!key || !token) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const v = verifySignedToken(token);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 403 });
  if (v.documentId !== `${action}:${key}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return key;
}

export async function PUT(req: NextRequest) {
  const key = check(req, "put");
  if (typeof key !== "string") return key;
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_LOCAL_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  await getObjectStorage().put({
    key,
    body,
    contentType: req.headers.get("content-type") ?? "application/octet-stream",
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const key = check(req, "get");
  if (typeof key !== "string") return key;
  const stored = await getObjectStorage().get(key);
  if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = req.nextUrl.searchParams.get("name") ?? "file";
  const disposition = req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(stored.body), {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
