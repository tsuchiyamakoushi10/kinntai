import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 設定 (E2E スモーク用)。
 *
 * - dev 用の Next.js サーバを `pnpm dev` で立ち上げ、3001 ポートで待つ。
 *   既存の開発サーバが 3000 で走っていてもぶつからないように分離。
 * - DB は `.env` の DATABASE_URL を使う。CI では `pnpm db:reset --force` で
 *   毎回クリーンに揃える前提（reset → seed → next start を回す）。
 * - 仕様上の利用シナリオは PC + iPhone Safari + iPad のため、デフォルトで
 *   それぞれを並行プロジェクトとして実行する。
 */
export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: false, // DB を共有しているため直列化しておく
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --port 3001",
        url: "http://localhost:3001",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // 開発サーバを E2E が起動した直後は、メールは握り潰す (console 出力のみ)
          MAIL_DRIVER: "console",
        },
      },

  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-safari",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "ipad",
      use: { ...devices["iPad (gen 7) landscape"] },
    },
  ],
});
