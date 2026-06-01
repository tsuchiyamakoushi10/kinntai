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
  const directUrl = process.env.DIRECT_URL ?? "";
  // password 部だけマスクして全体を出す
  const masked = url.replace(/:([^:@/]+)@/, ":***@");
  const directMasked = directUrl.replace(/:([^:@/]+)@/, ":***@");
  const hostMatch = url.match(/@([^/?]+)/);
  const dbHost = hostMatch ? hostMatch[1] : "(parse failed)";
  // postgres.<PROJECT_REF>: の <PROJECT_REF> を抽出
  const refMatch = url.match(/postgres\.([^:]+):/);
  const projectRef = refMatch ? refMatch[1] : "(parse failed)";

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
      projectRef,
      databaseUrl: masked,
      directUrl: directMasked,
      userCount,
      firstAdmin: adminUser,
      targetAdmin: targetUser,
    });
  } catch (err) {
    return NextResponse.json(
      {
        dbHost,
        projectRef,
        databaseUrl: masked,
        directUrl: directMasked,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
