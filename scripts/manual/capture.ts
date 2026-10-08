/**
 * マニュアル用の画面写真を撮る (ローカルの練習データだけで動かす)。
 *
 * 実行: pnpm manual:capture  (pnpm dev と pnpm manual:prepare の後。動画を先に作ると、
 *       通知書や回答が入った状態で撮れる)
 * 出力: dist/manual/images/*.png
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { type Page, chromium } from "@playwright/test";

import { MANUAL_ADMIN, MANUAL_STAFF } from "./accounts";
import { assertLocal, BASE_URL, OUT_DIR } from "./video";

type Shot = {
  file: string;
  path: string;
  /** 撮る前の操作 */
  before?: (page: Page) => Promise<void>;
  /** 画面全体ではなく、この要素だけ撮る */
  clip?: string;
  fullPage?: boolean;
};

const HIDE_DEV = "nextjs-portal{display:none!important}";

function nextYm(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7);
}

const ADMIN_SHOTS: Shot[] = [
  { file: "admin-login.png", path: "/login" },
  { file: "admin-dashboard.png", path: "/admin" },
  {
    file: "admin-shifts.png",
    path: "/admin/shifts",
    before: async (p) => {
      const day = await p
        .locator("select")
        .first()
        .locator("option", { hasText: "デイサービス結いの心" })
        .getAttribute("value");
      await p.goto(`${BASE_URL}/admin/shifts?officeId=${day}&ym=${nextYm()}`, {
        waitUntil: "networkidle",
      });
    },
  },
  {
    file: "admin-shift-palette.png",
    path: "/admin/shifts",
    before: async (p) => {
      const day = await p
        .locator("select")
        .first()
        .locator("option", { hasText: "デイサービス結いの心" })
        .getAttribute("value");
      await p.goto(`${BASE_URL}/admin/shifts?officeId=${day}&ym=${nextYm()}`, {
        waitUntil: "networkidle",
      });
    },
    clip: "text=シフトパターンを選んでセルをクリックで貼り付け >> xpath=..",
  },
  { file: "admin-shift-preferences.png", path: "/admin/shift-preferences" },
  { file: "admin-employees.png", path: "/admin/employees" },
  { file: "admin-employee-new.png", path: "/admin/employees/new", fullPage: true },
  { file: "admin-credentials.png", path: "/admin/employees/credentials" },
  { file: "admin-labor-notices.png", path: "/admin/labor-notices" },
  {
    file: "admin-labor-notice-new.png",
    path: "/admin/labor-notices/new",
    before: async (p) => {
      await p.locator("select").first().selectOption({ index: 5 });
      await p.getByRole("button", { name: "パート", exact: true }).click();
      await p.getByLabel("時給").fill("1250");
      await p.waitForTimeout(800);
    },
  },
  {
    file: "admin-labor-notice-detail.png",
    path: "/admin/labor-notices",
    before: async (p) => {
      const link = p.locator("tbody a").first();
      if (await link.count()) {
        await link.click();
        await p.waitForLoadState("networkidle");
      }
    },
  },
  { file: "admin-labor-notice-settings.png", path: "/admin/labor-notice-settings" },
  { file: "admin-surveys.png", path: "/admin/training-surveys" },
  { file: "admin-survey-new.png", path: "/admin/training-surveys/new", fullPage: true },
  {
    file: "admin-survey-result.png",
    path: "/admin/training-surveys",
    before: async (p) => {
      await p
        .locator("li")
        .filter({ hasText: "感染症対策の研修" })
        .getByRole("link", { name: "結果を見る" })
        .click();
      await p.waitForLoadState("networkidle");
    },
    fullPage: true,
  },
  {
    file: "admin-survey-people.png",
    path: "/admin/training-surveys",
    before: async (p) => {
      await p
        .locator("li")
        .filter({ hasText: "感染症対策の研修" })
        .getByRole("link", { name: "結果を見る" })
        .click();
      await p.getByRole("tab", { name: /個別/ }).click();
      await p.waitForLoadState("networkidle");
    },
  },
  { file: "admin-leave.png", path: "/admin/leave" },
  { file: "admin-leave-alerts.png", path: "/admin/leave/alerts" },
  { file: "admin-company.png", path: "/admin/company-profile" },
  { file: "admin-offices.png", path: "/admin/offices" },
];

const STAFF_SHOTS: Shot[] = [
  { file: "staff-home.png", path: "/me" },
  { file: "staff-shifts.png", path: "/me/shifts" },
  { file: "staff-preferences.png", path: "/me/shift-preferences", fullPage: true },
  { file: "staff-surveys.png", path: "/me/surveys" },
  {
    file: "staff-survey-answer.png",
    path: "/me/surveys",
    before: async (p) => {
      const href = await p.locator("a[href^='/me/surveys/']").first().getAttribute("href");
      await p.goto(`${BASE_URL}${href}`, { waitUntil: "networkidle" });
    },
  },
  { file: "staff-profile.png", path: "/me/profile" },
];

async function run(
  shots: Shot[],
  account: { identifier: string; password: string },
  viewport: { width: number; height: number },
  mobile: boolean,
): Promise<void> {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1.5,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    // ログイン画面は先に撮る
    for (const s of shots.filter((x) => x.path === "/login")) {
      await page.addStyleTag({ content: HIDE_DEV });
      await page.screenshot({ path: join(OUT_DIR, "images", s.file) });
    }
    await page.fill('input[name="identifier"]', account.identifier);
    await page.fill('input[name="password"]', account.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|me)/);

    // 1 枚ごとに新しいタブで撮って閉じる (縦長の写真を続けて撮るとメモリ不足で落ちるため)
    await page.close();
    for (const s of shots.filter((x) => x.path !== "/login")) {
      const tab = await context.newPage();
      try {
        await tab.goto(`${BASE_URL}${s.path}`, { waitUntil: "networkidle" });
        if (s.before) await s.before(tab);
        await tab.addStyleTag({ content: HIDE_DEV });
        await tab.waitForTimeout(300);
        const out = join(OUT_DIR, "images", s.file);
        if (s.clip) await tab.locator(s.clip).first().screenshot({ path: out });
        else await tab.screenshot({ path: out, fullPage: s.fullPage === true });
        console.log(`  ${s.file}`);
      } finally {
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  assertLocal();
  await mkdir(join(OUT_DIR, "images"), { recursive: true });
  console.log("管理者の画面");
  await run(ADMIN_SHOTS, MANUAL_ADMIN, { width: 1280, height: 860 }, false);
  console.log("職員の画面");
  await run(STAFF_SHOTS, MANUAL_STAFF, { width: 390, height: 780 }, true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
