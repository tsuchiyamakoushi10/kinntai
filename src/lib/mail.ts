/**
 * メール送信の薄いラッパ。
 *
 * 動作モードは `MAIL_DRIVER` で切り替える:
 *   - `console` (デフォルト): nodemailer は使わず stdout に内容を吐くだけ。
 *     開発・テスト中に「送信内容を確認したい」用途。
 *   - `smtp`: SMTP_HOST/PORT/USER/PASSWORD を使って実送信する。
 *
 * 個人情報保護 (CLAUDE.md §5): エラー時のログにはメールアドレスや本文を
 * そのままは載せない。代わりに「送信先ドメイン + 件名」程度に留める。
 */
import nodemailer, { type Transporter } from "nodemailer";

import { APP_NAME } from "@/lib/brand";

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

let cachedTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST is required when MAIL_DRIVER=smtp");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER || undefined;
  const pass = process.env.SMTP_PASSWORD || undefined;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: pass ?? "" } : undefined,
  });
  return cachedTransport;
}

function fromAddress(): string {
  const name = process.env.MAIL_FROM_NAME ?? APP_NAME;
  const addr = process.env.MAIL_FROM_ADDRESS ?? "no-reply@example.com";
  return `"${name}" <${addr}>`;
}

function safeDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at) : "(no-domain)";
}

export async function sendMail(mail: Mail): Promise<void> {
  const driver = (process.env.MAIL_DRIVER ?? "console").toLowerCase();

  if (driver === "console") {
    // 開発時のローカル確認用。stdout に出すだけ。
    console.log("─── mail (console) ─────────────────────────────");
    console.log(`To:      ${mail.to}`);
    console.log(`From:    ${fromAddress()}`);
    console.log(`Subject: ${mail.subject}`);
    console.log("");
    console.log(mail.text);
    console.log("────────────────────────────────────────────────");
    return;
  }

  if (driver !== "smtp") {
    throw new Error(`unknown MAIL_DRIVER: ${driver}`);
  }

  try {
    await getSmtpTransport().sendMail({
      from: fromAddress(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  } catch (e) {
    // PII を残さないため、ドメインと件名だけログに残す。
    console.error(`mail send failed: domain=${safeDomain(mail.to)}, subject=${mail.subject}`, e);
    throw e;
  }
}
