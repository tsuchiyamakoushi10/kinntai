import { expect, test } from "@playwright/test";

import {
  TEST_ADMIN,
  TEST_EMPLOYEE_E0001,
  clearAttendanceFor,
  disconnectPrisma,
  loginAs,
  prisma,
} from "./helpers";

/**
 * タブレット打刻のスモーク:
 *   1. 管理者でログインして /tablet/setup にアクセス
 *   2. E0001 の所属拠点で端末を登録
 *   3. /tablet 一覧から E0001 を選択
 *   4. PIN "0001" を入力
 *   5. 出勤ボタンを押す
 *   6. /tablet/done で「出勤しました」が表示される
 */
test.beforeEach(async () => {
  await clearAttendanceFor(TEST_EMPLOYEE_E0001.employeeCode);
});

test.afterAll(async () => {
  await clearAttendanceFor(TEST_EMPLOYEE_E0001.employeeCode);
  await disconnectPrisma();
});

test("共有タブレットからセットアップ→PIN→打刻が完走する", async ({ page }) => {
  // 事前に E0001 の所属拠点を取得（seed 通りなら NRS-CENTER のはず）
  const employee = await prisma.employee.findUnique({
    where: { employeeCode: TEST_EMPLOYEE_E0001.employeeCode },
    select: { officeId: true, lastName: true, firstName: true },
  });
  if (!employee) throw new Error("E0001 の seed が見つかりません");
  const fullName = `${employee.lastName} ${employee.firstName}`;

  // 1. 管理者ログイン → /tablet/setup
  await loginAs(page, TEST_ADMIN);
  await page.goto("/tablet/setup");
  await expect(
    page.getByRole("heading", { name: "この端末を使う拠点を選んでください" }),
  ).toBeVisible();

  // 2. 拠点を選んで登録
  await page.locator(`input[name="officeId"][value="${employee.officeId}"]`).check();
  await page.getByRole("button", { name: "この拠点で使う" }).click();

  // 3. /tablet 本人選択画面
  await expect(page).toHaveURL("/tablet");
  await page.getByRole("link", { name: new RegExp(fullName) }).click();

  // 4. PIN 入力 (4 桁押した時点で自動 submit)
  await expect(page).toHaveURL(/\/tablet\/pin/);
  for (const d of TEST_EMPLOYEE_E0001.pin) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }

  // 5. 打刻メニュー → 出勤
  await expect(page).toHaveURL("/tablet/punch");
  await page.getByRole("button", { name: "出勤", exact: true }).click();

  // 6. 完了画面
  await expect(page).toHaveURL(/\/tablet\/done/);
  await expect(page.getByText("出勤しました")).toBeVisible();
});
