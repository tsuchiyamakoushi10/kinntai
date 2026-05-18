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
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(raw) {
        const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
        const password = typeof raw.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { employee: true },
        });
        if (!user || !user.isActive) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
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
