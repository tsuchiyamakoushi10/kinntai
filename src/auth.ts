/**
 * Auth.js v5 のフル設定。Credentials provider が Prisma に触るため、
 * Node ランタイムでだけ評価される箇所からのみ import する。
 *
 * middleware からは `src/auth.config.ts` 経由で簡略版を読むこと。
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

// session.user に role / employeeId を載せられるよう型拡張する。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "EMPLOYEE";
      employeeId: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "ID（職員番号またはメール）", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(raw) {
        const identifier = typeof raw.identifier === "string" ? raw.identifier.trim() : "";
        const password = typeof raw.password === "string" ? raw.password : "";
        if (!identifier || !password) return null;

        // loginId (例 "e0001") を優先し、無ければメール (小文字化) で照合する。
        // どちらか一方でもログインできるようにする。
        const user =
          (await prisma.user.findUnique({
            where: { loginId: identifier.toLowerCase() },
            include: { employee: true },
          })) ??
          (await prisma.user.findUnique({
            where: { email: identifier.toLowerCase() },
            include: { employee: true },
          }));
        if (!user || !user.isActive) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.employee ? `${user.employee.lastName} ${user.employee.firstName}` : "管理者",
          role: user.role,
          employeeId: user.employeeId,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      // PII を含めないため email や名前はログに残さず、id のみで更新する。
      await prisma.user
        .update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })
        .catch(() => {
          // 既にレコードが消えているケース等は致命的ではないため握り潰す。
        });
    },
  },
});
