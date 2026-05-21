/**
 * S-A-22 書類タブのスモーク。
 *
 * - 管理者でログイン → 従業員 E0001 の書類タブを開いて PDF をアップロードできる
 * - 一覧に表示され、ダウンロード URL は HTTP 200 を返す
 * - 削除ボタンで一覧から消える
 * - 書類アクセスログ (download/delete) が DB に記録される
 *
 * 個人情報 (履歴書実物) はテストに含めない。テストファイルは "kinntai-test" の
 * バイト列を持つ仮想 PDF (ヘッダだけ %PDF) を使う。
 */
import { expect, test } from "@playwright/test";

import { TEST_ADMIN, disconnectPrisma, loginAs, prisma } from "./helpers";

const E0001_CODE = "E0001";
const TEST_TITLE = "E2E アップロード書類";

async function clearTestDocumentsFor(employeeCode: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true },
  });
  if (!employee) return;
  await prisma.documentAccessLog.deleteMany({
    where: { document: { employeeId: employee.id, title: TEST_TITLE } },
  });
  await prisma.employeeDocument.deleteMany({
    where: { employeeId: employee.id, title: TEST_TITLE },
  });
}

test.beforeEach(async () => {
  await clearTestDocumentsFor(E0001_CODE);
});

test.afterAll(async () => {
  await clearTestDocumentsFor(E0001_CODE);
  await disconnectPrisma();
});

test("管理者が書類をアップロード → ダウンロード → 削除できる", async ({ page }) => {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode: E0001_CODE },
    select: { id: true, lastName: true, firstName: true },
  });
  expect(employee).not.toBeNull();
  if (!employee) return;

  await loginAs(page, TEST_ADMIN);
  await page.goto(`/admin/employees/${employee.id}?tab=documents`);
  await expect(page.getByRole("heading", { name: "書類を追加する" })).toBeVisible();

  // 仮想 PDF (ヘッダだけ %PDF) をアップロード
  const fileBytes = Buffer.from("%PDF-1.4\n% kinntai e2e test\n");
  await page.getByLabel("書類名").fill(TEST_TITLE);
  await page.getByLabel("種別").selectOption("RESUME");
  await page.getByLabel("ファイル").setInputFiles({
    name: "履歴書.pdf",
    mimeType: "application/pdf",
    buffer: fileBytes,
  });
  await page.getByRole("button", { name: /アップロード/ }).click();

  // 登録済み書類一覧にタイトルが表示される
  const docRow = page.locator("tr", { hasText: TEST_TITLE });
  await expect(docRow).toBeVisible();

  // ダウンロード URL を抽出して直接叩く (Playwright の page.request はセッション共有)
  const downloadHref = await docRow
    .getByRole("link", { name: "ダウンロード" })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();
  const response = await page.request.get(downloadHref!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const body = await response.body();
  expect(body.equals(fileBytes)).toBe(true);

  // 監査ログに DOWNLOAD が積まれている
  const downloadLog = await prisma.documentAccessLog.findFirst({
    where: {
      action: "DOWNLOAD",
      document: { employeeId: employee.id, title: TEST_TITLE },
    },
  });
  expect(downloadLog).not.toBeNull();

  // 削除ボタン → 一覧から消える + DOWNLOAD/DELETE 含むログが残る
  await docRow.getByRole("button", { name: "削除" }).click();
  await expect(page.locator("tr", { hasText: TEST_TITLE })).toHaveCount(0);
  const deleteLog = await prisma.documentAccessLog.findFirst({
    where: {
      action: "DELETE",
      document: { employeeId: employee.id, title: TEST_TITLE },
    },
  });
  expect(deleteLog).not.toBeNull();
});

test("ダウンロード URL の署名が改ざんされていると 403 を返す", async ({ page }) => {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode: E0001_CODE },
    select: { id: true },
  });
  if (!employee) throw new Error("E0001 not found");

  await loginAs(page, TEST_ADMIN);
  await page.goto(`/admin/employees/${employee.id}?tab=documents`);

  // 書類が無い状態でも、署名検証が token を見るので fake document id でテストできる。
  // 適当な UUID + 不正トークンで HMAC 検証エラーになることを確認する。
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const tamperedToken = "AAAA.BBBB"; // signature 部が一致しない
  const response = await page.request.get(
    `/api/employee-documents/${fakeId}/download?token=${encodeURIComponent(tamperedToken)}`,
  );
  expect(response.status()).toBe(403);
});

test("ダウンロード URL に token が無いと 400 を返す", async ({ page }) => {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode: E0001_CODE },
    select: { id: true },
  });
  if (!employee) throw new Error("E0001 not found");

  await loginAs(page, TEST_ADMIN);
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const response = await page.request.get(`/api/employee-documents/${fakeId}/download`);
  expect(response.status()).toBe(400);
});
