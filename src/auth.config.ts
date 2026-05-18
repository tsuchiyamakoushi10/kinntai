/**
 * Edge ランタイムで読み込み可能な Auth.js 設定。
 *
 * middleware は Edge で動くため、Prisma など Node 依存のコードを参照する
 * Credentials provider はここに置けない。providers は `src/auth.ts` で
 * このオブジェクトをスプレッドした上で追加する。
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // .env の AUTH_SESSION_MAX_AGE を秒で受け取る。未設定なら 30 日。
    maxAge: Number(process.env.AUTH_SESSION_MAX_AGE ?? 60 * 60 * 24 * 30),
  },
  callbacks: {
    async jwt({ token, user }) {
      // `authorize` から返ってきた直後にだけ user が入る。以降は token に persist。
      if (user) {
        token.role = (user as { role?: string }).role;
        token.employeeId = (user as { employeeId?: string | null }).employeeId ?? null;
        token.userId = (user as { id?: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.employeeId = (token.employeeId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
