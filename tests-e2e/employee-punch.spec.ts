import { expect, test } from "@playwright/test";

import { TEST_EMPLOYEE_E0001, clearAttendanceFor, disconnectPrisma, loginAs } from "./helpers";

test.beforeEach(async () => {
  await clearAttendanceFor(TEST_EMPLOYEE_E0001.employeeCode);
});

test.afterAll(async () => {
  await clearAttendanceFor(TEST_EMPLOYEE_E0001.employeeCode);
  await disconnectPrisma();
});

test("従業員がスマホ画面から出勤打刻して勤務中状態になる", async ({ page }) => {
  await loginAs(page, TEST_EMPLOYEE_E0001);
  await expect(page).toHaveURL(/\/me/);

  // 初期状態は「出勤前」
  await expect(page.getByText("出勤前").first()).toBeVisible();

  // 出勤ボタンを押す
  await page.getByRole("button", { name: "出勤", exact: true }).click();

  // 「勤務中」に遷移し、退勤 / 休憩開始のボタンが表示される
  await expect(page.getByText("勤務中").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "退勤", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "休憩開始", exact: true })).toBeVisible();
});
