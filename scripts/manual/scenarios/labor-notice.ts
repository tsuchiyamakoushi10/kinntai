import type { Scenario } from "../video";
import { MANUAL_ADMIN } from "../accounts";

/** 労働条件通知書を作って発行する */
export const laborNotice: Scenario = {
  id: "03_労働条件通知書を作る",
  title: "労働条件通知書を作る",
  login: MANUAL_ADMIN,
  start: "/admin/labor-notices",
  steps: [
    {
      say: "労働条件通知書の作り方を説明します。5つの項目を入れるだけで、通知書2枚と、同意書1枚の、合わせて3枚ができます。",
    },
    {
      say: "左のメニューの、労働条件通知書を開き、右上の、新しく作る、を押します。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("link", { name: "労働条件通知書" }).first());
        await c.click(c.page.getByRole("link", { name: "＋ 新しく作る" }));
      },
    },
    {
      say: "まず従業員を選びます。所属している事業所や、仕事の内容は、自動で入ります。",
      do: async (c) => {
        const sel = c.page.locator("select").first();
        await c.highlight(sel);
        await sel.selectOption({ index: 3 });
      },
    },
    {
      say: "次に雇用形態を選びます。ここではパートを選びます。休日や賞与などの文言、契約期間、勤務パターンが、パートの内容に切り替わります。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "パート", exact: true }));
      },
    },
    {
      say: "働き始める日を確認します。パートは最初の6か月が期間ありの契約で、その後は期間の定めなしに切り替わります。終わりの日は自動で計算されます。",
      do: async (c) => {
        await c.highlight(c.page.getByText("期間が終わったら「期間の定めなし」に切り替える"));
      },
    },
    {
      say: "勤務先を確認し、時給を入れます。最低賃金を下回ると、上に注意が出ます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByLabel("時給"));
        await c.type(c.page.getByLabel("時給"), "1250");
      },
    },
    {
      say: "勤務パターンと、週に何日、何時間働くかを確認します。有給の日数や、社会保険に入るかどうかも、自動で判定されます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("週に何日"));
        await c.highlight(c.page.getByText(/有給（6か月後）/));
      },
    },
    {
      say: "右側には、印刷される書面のプレビューが出ます。入力すると、その場で書き変わります。",
      do: async (c) => {
        await c.highlight(c.page.locator("iframe"));
      },
    },
    {
      say: "内容がよければ、発行する、を押します。通知書の番号が付き、雇用契約の内容も同時に更新されます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "発行する" }));
        await c.page.waitForURL(/labor-notices\/[0-9a-f-]{36}$/);
      },
    },
    {
      say: "発行すると、詳細の画面になります。PDFをダウンロードして印刷し、本人に説明して渡してください。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("link", { name: /PDF をダウンロード/ }));
      },
    },
    {
      say: "本人が3枚目に署名したら、スマホで撮影して、ここから登録します。登録すると、署名済みになります。",
      do: async (c) => {
        await c.highlight(c.page.getByText("本人が署名した3枚目を登録する"));
      },
    },
    {
      say: "間違いに気づいたときは、無効にして、作り直します。発行した後に書き直すことはできません。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: /無効にする/ }));
      },
    },
  ],
};
