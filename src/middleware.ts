/**
 * 認証 / ロールに応じた経路ガード。
 *
 * - 未認証なら /login に飛ばす（戻り先は ?from= に積む）
 * - /admin 配下は role=ADMIN のみ
 * - /me 配下は role=EMPLOYEE のみ（管理者は /admin にリダイレクト）
 * - / は role に応じたホームへ送る
 *
 * middleware は Edge ランタイムで動くため、Prisma に触らない
 * `src/auth.config.ts` 経由で軽量な NextAuth を立てている。
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon"];

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const user = req.auth?.user;
  if (!user) {
    const url = new URL("/login", nextUrl);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/me", nextUrl));
  }
  if (pathname.startsWith("/me") && user.role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL("/admin", nextUrl));
  }
  if (pathname === "/") {
    const home = user.role === "ADMIN" ? "/admin" : "/me";
    return NextResponse.redirect(new URL(home, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // 静的アセット以外を網羅。next/image や favicon は PUBLIC_PREFIXES で抜く。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
