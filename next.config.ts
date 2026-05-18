import type { NextConfig } from "next";

const codespaceName = process.env.CODESPACE_NAME;
const codespaceForwardingDomain =
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev";

// Codespaces / Gitpod 等のプロキシ越し経由で dev に入ると Origin と Host が
// 食い違い、Server Actions が "Invalid Server Actions request" で 403 する。
// 開発時のフォワーディングホストを allowedOrigins に積んでおく。
const serverActionAllowedOrigins = ["localhost:3000"];
if (codespaceName) {
  serverActionAllowedOrigins.push(`${codespaceName}-3000.${codespaceForwardingDomain}`);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins,
    },
  },
};

export default nextConfig;
