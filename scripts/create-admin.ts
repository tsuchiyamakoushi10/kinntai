/**
 * 管理者 (ADMIN) ログインアカウントを 1 名作成する（または既存の同メールを管理者に更新）。
 *
 * フル seed (seed-prod.ts) と違い、拠点・シフトパターン・会社情報などのマスターには一切触れない。
 * 既存の本番 DB に「お客様用の管理者アカウントだけ」を後から足したいとき用。
 *
 * 入力 (環境変数):
 *   ADMIN_EMAIL    … ログイン用メールアドレス
 *   ADMIN_PASSWORD … 初期パスワード (8 文字以上)。初回ログインで本人に変更を強制する
 *                    (must_change_password = true)。
 *
 * 実行例 (現行 Supabase に対して):
 *   set -a; . ./.env.prod.local; set +a
 *   DATABASE_URL="$POSTGRES_PRISMA_URL" DIRECT_URL="$POSTGRES_URL_NON_POOLING" \
 *     ADMIN_EMAIL="owner@example.com" ADMIN_PASSWORD="（8文字以上）" \
 *     npx tsx scripts/create-admin.ts
 *
 * べき等: 同じメールで再実行すると、その人を ADMIN・有効化し、パスワードを再設定する
 * (= パスワードリセット用途にも使える)。
 */
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD を環境変数で渡してください。");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD は 8 文字以上にしてください。");
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", isActive: true, passwordHash, mustChangePassword: true },
    });
    console.log(`既存ユーザーを管理者に更新し、パスワードを再設定しました: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "ADMIN",
        employeeId: null,
        isActive: true,
        mustChangePassword: true,
      },
    });
    console.log(`管理者アカウントを新規作成しました: ${email}`);
  }

  console.log("");
  console.log("ログイン情報:");
  console.log(`  メール   : ${email}`);
  console.log("  パスワード: (ADMIN_PASSWORD に渡した値)");
  console.log("※ 初回ログインでパスワード変更が求められます。お客様に伝えてください。");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
