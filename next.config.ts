import type { NextConfig } from "next";

const codespaceName = process.env.CODESPACE_NAME;
const codespaceForwardingDomain =
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev";

// Codespaces / Gitpod 等のプロキシ越し経由で dev に入ると Origin と Host が
// 食い違い、Server Actions が "Invalid Server Actions request" で 403 する。
// 開発時のフォワーディングホストを allowedOrigins に積んでおく。
// 3001 は Playwright E2E が使うポート (playwright.config.ts と一致させる)。
const serverActionAllowedOrigins = ["localhost:3000", "localhost:3001"];
if (codespaceName) {
  serverActionAllowedOrigins.push(
    `${codespaceName}-3000.${codespaceForwardingDomain}`,
    `${codespaceName}-3001.${codespaceForwardingDomain}`,
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Chromium 系は Node ランタイムで動的に起動する重い依存なので、webpack の
  // バンドル対象から外してネイティブモジュールの解決失敗を防ぐ。
  // (S-A-15 / S-A-18 PDF 出力用、route handler から動的 import される)
  // - Playwright: ローカル / Codespaces / 自前サーバ用
  // - @sparticuz/chromium + puppeteer-core: Vercel/Lambda の serverless 用
  serverExternalPackages: [
    "@playwright/test",
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "puppeteer-core",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins,
    },
  },
};

export default nextConfig;
