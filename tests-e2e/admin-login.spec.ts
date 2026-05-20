import { expect, test } from "@playwright/test";

import { TEST_ADMIN, disconnectPrisma, loginAs } from "./helpers";

test.afterAll(async () => {
  await disconnectPrisma();
});

test("管理者がログインしてダッシュボードを表示できる", async ({ page }) => {
  await loginAs(page, TEST_ADMIN);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本日の出勤状況" })).toBeVisible();
});
