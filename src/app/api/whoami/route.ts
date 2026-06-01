/**
 * 一時診断用エンドポイント。
 * Vercel ランタイムが何 DB に繋がっていて、admin が見えるか確認するため。
 * 確認後に必ず削除すること。
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL ?? "";
  // ホスト部だけ抜き出して password はマスク
  const match = url.match(/@([^/?]+)/);
  const dbHost = match ? match[1] : "(parse failed)";
  const urlPrefix = url.slice(0, 18); // "postgres://postgres" などまで

  try {
    const userCount = await prisma.user.count();
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { email: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const targetUser = await prisma.user.findUnique({
      where: { email: "tsuchiyamakoushi10@gmail.com" },
      select: { email: true, role: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({
      dbHost,
      urlPrefix,
      userCount,
      firstAdmin: adminUser,
      targetAdmin: targetUser,
    });
  } catch (err) {
    return NextResponse.json(
      {
        dbHost,
        urlPrefix,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
