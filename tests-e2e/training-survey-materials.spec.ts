/**
 * 研修アンケートの研修資料 (docs/training-survey.md §2.2) のスモーク。
 *
 * - 管理者: PDF を添付し、リンクを足して保存 → 配信
 * - 職員 E0001: 資料を開くまで送信できない → 開くと送信できる
 * - 見た記録が DB に付く
 */
import { expect, test } from "@playwright/test";

import { TEST_ADMIN, TEST_EMPLOYEE_E0001, disconnectPrisma, loginAs, prisma } from "./helpers";

const TITLE = "E2E 研修資料つきアンケート";

async function clearTestSurveys(): Promise<void> {
  await prisma.trainingRecord.deleteMany({ where: { trainingName: TITLE } });
  await prisma.trainingSurvey.deleteMany({ where: { title: TITLE } });
}

test.beforeEach(clearTestSurveys);
test.afterAll(async () => {
  if (!process.env.KEEP) await clearTestSurveys();
  await disconnectPrisma();
});

test("資料を見ないと回答できず、見ると回答できる", async ({ browser }) => {
  // dev サーバの初回コンパイルが重い画面をいくつも開くため長めに取る
  test.setTimeout(240_000);
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeCode: TEST_EMPLOYEE_E0001.employeeCode },
    select: { id: true, lastName: true, firstName: true, office: { select: { name: true } } },
  });

  // --- 管理者: 作成 ---
  const admin = await browser.newPage();
  await loginAs(admin, TEST_ADMIN);
  await admin.goto("/admin/training-surveys/new");
  await admin.getByPlaceholder("例: 移乗介助の研修").fill(TITLE);

  await admin.locator('input[type="file"]').setInputFiles({
    name: "感染症対策マニュアル.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nkinntai-test\n%%EOF"),
  });
  await expect(admin.getByLabel("表示名").first()).toHaveValue("感染症対策マニュアル");
  await expect(admin.getByText(/アップロード中/)).toHaveCount(0, { timeout: 15_000 });

  await admin.getByRole("button", { name: "＋ 動画・リンクを追加" }).click();
  await admin.getByLabel("URL").fill("https://example.com/kinntai-e2e");
  await admin.getByLabel("表示名").nth(1).fill("参考ページ");

  const office = admin.getByRole("group").filter({ hasText: employee.office!.name });
  await office.locator("summary").click();
  await office.getByLabel(`${employee.lastName} ${employee.firstName}`).check();
  await admin.getByRole("button", { name: "保存する" }).click();
  await expect(admin).toHaveURL(/\/admin\/training-surveys\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(admin.getByText("見た人 0 / 1人")).toHaveCount(2);
  admin.once("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "配信する" }).click();
  await expect(admin.getByText("受付中").first()).toBeVisible();

  const survey = await prisma.trainingSurvey.findFirstOrThrow({
    where: { title: TITLE },
    include: { materials: { orderBy: { sortOrder: "asc" } } },
  });
  expect(survey.materials.map((m) => [m.kind, m.title, m.mustView])).toEqual([
    ["FILE", "感染症対策マニュアル", true],
    ["LINK", "参考ページ", true],
  ]);

  // 管理者は保存したファイルを開ける (本体がストレージにある)
  const fileRes = await admin.request.get(
    `/api/training-materials/${survey.materials[0]!.id}/open`,
  );
  expect(fileRes.status()).toBe(200);
  expect(await fileRes.text()).toContain("kinntai-test");

  // --- 職員: 回答 ---
  const ctx = await browser.newContext();
  const me = await ctx.newPage();
  await loginAs(me, TEST_EMPLOYEE_E0001);
  await me.goto(`/me/surveys/${survey.id}`);
  const submit = me.getByRole("button", { name: "送信する" });
  await expect(me.getByText("0 / 2 見ました")).toBeVisible();
  await expect(submit).toBeDisabled();

  // 資料を開く (新しいタブ)。開いた先で「見た」が記録される
  const [filePage] = await Promise.all([
    me.waitForEvent("popup"),
    me.getByRole("link", { name: "開く", exact: true }).click(),
  ]);
  await filePage.close();
  await expect(me.getByText("1 / 2 見ました")).toBeVisible();
  await expect(submit).toBeDisabled();

  // 外部リンクはテスト環境から開けないことがあるので、記録 API だけ叩く
  await me.request.get(`/api/training-materials/${survey.materials[1]!.id}/open`, {
    maxRedirects: 0,
  });
  await me.reload();
  await expect(me.getByText("すべて見ました")).toBeVisible();

  // 1 問目・2 問目 (数の評価) に答えて送信
  for (const group of await me.locator("fieldset").all()) {
    const five = group.getByRole("button", { name: "5", exact: true });
    if (await five.count()) await five.first().click();
  }
  await submit.click();
  await expect(me.getByText("送信しました。")).toBeVisible();

  const views = await prisma.trainingSurveyMaterialView.count({
    where: { employeeId: employee.id, material: { surveyId: survey.id } },
  });
  expect(views).toBe(2);
  await ctx.close();

  // --- 管理者: 編集でリンクを消す。残したファイルの「見た」記録は消えない ---
  await admin.goto(`/admin/training-surveys/${survey.id}/edit`);
  await admin.getByRole("button", { name: "削除", exact: true }).nth(1).click();
  await admin.getByLabel("表示名").first().fill("感染症対策マニュアル（改訂）");
  await admin.getByRole("button", { name: "保存する" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/training-surveys/${survey.id}$`), {
    timeout: 15_000,
  });
  const after = await prisma.trainingSurveyMaterial.findMany({
    where: { surveyId: survey.id },
    include: { _count: { select: { views: true } } },
  });
  expect(after.map((m) => [m.id, m.title, m._count.views])).toEqual([
    [survey.materials[0]!.id, "感染症対策マニュアル（改訂）", 1],
  ]);
});
