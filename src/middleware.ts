/**
 * 認証 / ロールに応じた経路ガード。
 *
 * - 未認証なら /login に飛ばす（戻り先は ?from= に積む）
 * - /admin 配下は role=ADMIN のみ
 * - /me 配下は role=EMPLOYEE のみ（管理者は /admin にリダイレクト）
 * - /tablet 配下は Auth.js セッション不要（共有端末用）。ただし /tablet/setup は
 *   管理者ログイン必須（拠点登録の発行者を管理者に限定）。打刻フロー本体の
 *   認可は HMAC 署名付き cookie で行うため、ルート側のサーバーコンポーネントで
 *   ガードする。
 * - / は role に応じたホームへ送る
 *
 * middleware は Edge ランタイムで動くため、Prisma に触らない
 * `src/auth.config.ts` 経由で軽量な NextAuth を立てている。
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = [
  "/login",
  "/password-reset",
  "/api/auth",
  "/api/whoami",
  "/_next",
  "/favicon",
];

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // /tablet 配下は専用 cookie で認証する。/tablet/setup だけは管理者ログインが必須。
  if (pathname.startsWith("/tablet")) {
    const isSetup = pathname === "/tablet/setup" || pathname.startsWith("/tablet/setup/");
    if (isSetup) {
      const user = req.auth?.user;
      if (!user) {
        const url = new URL("/login", nextUrl);
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
      if (user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/me", nextUrl));
      }
    }
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
