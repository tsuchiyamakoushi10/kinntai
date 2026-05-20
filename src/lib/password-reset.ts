/**
 * パスワード再設定トークンの発行 / 検証 / 消費。
 *
 * セキュリティ方針:
 *   - 生トークンは 32 バイトの乱数を base64url で表現 (256bit エントロピ)。
 *   - DB に保存するのは sha256 ハッシュのみ。漏洩しても元トークンは復元不能。
 *   - 有効期限は 30 分。短すぎると現場が困り、長すぎると攻撃面が増えるので
 *     一般的な値に揃える。
 *   - 1 トークン 1 回限り使用。`used_at` を立てて再利用を防ぐ。
 *   - 検証時は timing-safe な比較 (sha256 ハッシュは長さが一定なので、
 *     DB ユニーク lookup でほぼ問題ないが、ハッシュ自体は事前に計算する)。
 *
 * 列挙対策 (S-C-02 側): 該当ユーザーがいない / 無効化されていてもエラーを
 * 返さず、呼び出し元は「リクエストを受け付けました」を画一的に返すこと。
 */
import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

const TTL_MS = 30 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export type IssuedToken = {
  rawToken: string;
  expiresAt: Date;
};

/**
 * 有効な再設定トークンを発行する。生トークンは戻り値経由でしか取得できず、
 * 呼び出し元の責任でメールに載せる。
 */
export async function issuePasswordResetToken(userId: string): Promise<IssuedToken> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { rawToken, expiresAt };
}

export type VerifiedToken = {
  id: string;
  userId: string;
};

/**
 * トークンを検証する。期限切れ / 使用済み / 存在しない場合は null。
 * 呼び出し元はこの結果に応じて UI を切り替える。
 */
export async function findValidPasswordResetToken(rawToken: string): Promise<VerifiedToken | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, userId: row.userId };
}

/** トークン消費 (used_at を立てる)。新パスワード適用と同一トランザクションで呼ぶ。 */
export async function consumePasswordResetToken(tokenId: string): Promise<void> {
  await prisma.passwordResetToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}

export const PASSWORD_RESET_TTL_MS = TTL_MS;
