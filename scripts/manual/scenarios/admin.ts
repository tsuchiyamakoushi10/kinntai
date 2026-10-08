import { MANUAL_ADMIN } from "../accounts";
import type { Scenario } from "../video";

/** 翌月 (YYYY-MM)。勤務表の動画は空の月で自動生成から見せる */
function nextYm(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 7);
}

export const adminLogin: Scenario = {
  id: "01_ログインと画面の見方",
  title: "ログインと画面の見方（管理者）",
  login: null,
  start: "/login",
  steps: [
    { say: "クロスシフトの管理画面への、ログインのしかたと、画面の見方を説明します。" },
    {
      say: "ログイン画面で、IDとパスワードを入れて、ログインを押します。IDには、メールアドレスか、職員番号を入れます。",
      do: async (c) => {
        await c.type(c.page.locator('input[name="identifier"]'), MANUAL_ADMIN.identifier);
        await c.type(c.page.locator('input[name="password"]'), MANUAL_ADMIN.password);
        await c.click(c.page.getByRole("button", { name: "ログイン" }));
        await c.page.waitForURL(/\/admin/);
      },
    },
    {
      say: "最初に開くのは、ダッシュボードです。在籍している人数や、有給の年5日の取得が足りない人の数が、ひと目でわかります。",
      do: async (c) => {
        await c.highlight(c.page.getByText("年5日アラート").first());
      },
    },
    {
      say: "左側がメニューです。従業員、労働条件通知書、研修アンケート、そして勤務表やシフト希望などに進めます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("link", { name: "従業員" }).first());
        await c.highlight(c.page.getByRole("link", { name: "勤務表" }).first());
      },
    },
    {
      say: "設定、を押すと、会社情報や拠点、シフトパターンなど、ふだんはあまり変えない項目が開きます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: /設定/ }).first());
      },
    },
    {
      say: "使い終わったら、右上のログアウトを押してください。共有のパソコンでは、必ずログアウトしましょう。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: "ログアウト" }));
      },
    },
  ],
};

export const shiftTable: Scenario = {
  id: "02_勤務表を作って職員に公開する",
  title: "勤務表を作って職員に公開する",
  login: MANUAL_ADMIN,
  start: "/admin/shifts",
  steps: [
    {
      say: "勤務表の作り方を説明します。自動で作った案を手直しして、職員に公開するまでの流れです。",
    },
    {
      say: "メニューの勤務表を開き、拠点と、対象の月を選んで、表示を押します。",
      do: async (c) => {
        await c.page.getByLabel("拠点").selectOption({ label: "デイサービス結いの心" });
        await c.page.getByLabel("対象月").fill(nextYm());
        await c.click(c.page.getByRole("button", { name: "表示" }));
        await c.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "縦に職員、横に日付が並びます。右の端には、その人の公休の日数が出ます。",
      do: async (c) => {
        await c.highlight(c.page.locator("table").first());
      },
    },
    {
      say: "シフト自動生成を押すと、配置基準や、職員の希望をもとに、1か月分の案が自動で入ります。",
      do: async (c) => {
        c.page.once("dialog", (d) => void d.accept());
        await c.click(c.page.getByRole("button", { name: "シフト自動生成" }));
        await c.page.getByText(/自動生成しました/).waitFor({ timeout: 60_000 });
        await c.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "手直しするときは、上の一覧から勤務の記号を選んで、変えたいマスを押します。何度でも貼り直せます。",
      do: async (c) => {
        await c.click(c.page.locator('button[title^="公休 ("]').first());
        const row = c.page.locator("table tbody tr").nth(1);
        await c.click(row.locator("td").nth(6));
        await c.click(row.locator("td").nth(7));
      },
    },
    {
      say: "変えた内容は、保存を押すまで確定しません。終わったら、必ず保存を押してください。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "保存", exact: true }));
        await c.page.getByText(/保存しました/).waitFor();
      },
    },
    {
      say: "人が足りない日があると、表の下に、足りない時間帯が赤く出ます。確認して調整してください。",
      do: async (c) => {
        const panel = c.page
          .getByText(/スタッフが足りない日があります|スタッフの不足はありません/)
          .first();
        if (await panel.count()) await c.scrollTo(panel);
      },
    },
    {
      say: "できあがったら、職員に公開、を押します。公開すると、職員が自分のスマホで、この月のシフトを見られるようになります。",
      do: async (c) => {
        await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        c.page.once("dialog", (d) => void d.accept());
        await c.click(c.page.getByRole("button", { name: "職員に公開" }));
        await c.page.getByText(/公開済/).waitFor();
      },
    },
    {
      say: "公開した後に直した内容も、保存すれば、そのまま職員の画面に反映されます。",
    },
  ],
};

export const laborNoticeSettings: Scenario = {
  id: "04_労働条件通知書の設定を変える",
  title: "労働条件通知書の設定を変える",
  login: MANUAL_ADMIN,
  start: "/admin/labor-notice-settings",
  steps: [
    {
      say: "労働条件通知書を作るときに、最初から入る内容の変え方を説明します。発行済みの通知書は変わりません。",
    },
    {
      say: "設定の中の、労働条件通知書の設定を開きます。正社員、パート、夜勤専従ごとに、休日や賞与などの文言を変えられます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: "パート", exact: true }));
        await c.click(c.page.getByRole("button", { name: "パート", exact: true }));
      },
    },
    {
      say: "書面に載せる手当も、ここで追加や削除ができます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("書面に載せる手当"));
      },
    },
    {
      say: "変えたら、設定を保存、を押します。",
      do: async (c) => {
        await c.scrollTo(c.page.getByRole("button", { name: /の設定を保存/ }));
        await c.highlight(c.page.getByRole("button", { name: /の設定を保存/ }));
      },
    },
    {
      say: "勤務パターンのタブでは、書面に載る勤務時間と休憩を変えられます。",
      do: async (c) => {
        await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await c.click(c.page.getByRole("tab", { name: "勤務パターン" }));
      },
    },
    {
      say: "最低賃金のタブでは、毎年10月ごろの改定のときに、新しい金額と、発効日を追加してください。",
      do: async (c) => {
        await c.click(c.page.getByRole("tab", { name: "最低賃金" }));
      },
    },
    {
      say: "事業所の管理者名と電話番号は、設定の拠点で、会社の住所や代表者は、会社情報で変えます。通知書の相談窓口などに印刷されます。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "拠点" }));
      },
    },
  ],
};

export const shiftPreferences: Scenario = {
  id: "07_シフト希望を確認する",
  title: "シフト希望を確認する",
  login: MANUAL_ADMIN,
  start: "/admin/shift-preferences",
  steps: [
    { say: "職員から出されたシフト希望の確認と、紙で集めた希望の入力のしかたを説明します。" },
    {
      say: "メニューのシフト希望を開きます。月と拠点、状態で絞り込めます。上の数字は、承認待ち、承認済み、却下の件数です。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: "絞り込み" }));
      },
    },
    {
      say: "紙で集めた希望休は、希望休カレンダー入力で、一人ずつまとめて入れられます。職員を選んで、カレンダーを開く、を押します。",
      do: async (c) => {
        const sel = c.page.getByLabel("対象社員");
        await c.scrollTo(sel);
        await sel.selectOption({ index: 2 });
        await c.click(c.page.getByRole("button", { name: "カレンダーを開く" }));
      },
    },
    {
      say: "付ける種類を選んで、日付を押します。もう一度押すと外れます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "希望休", exact: true }).first());
        await c.click(c.page.getByRole("button", { name: "12", exact: true }));
        await c.click(c.page.getByRole("button", { name: "13", exact: true }));
      },
    },
    {
      say: "保存を押すと、承認済みとして登録され、勤務表にも色で表示されます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "保存", exact: true }).first());
      },
    },
    {
      say: "職員がスマホから出した希望は、下の一覧に、承認待ちで並びます。承認、または却下を押して、確定させてください。",
      do: async (c) => {
        const t = c.page.locator("table").last();
        await c.scrollTo(t);
      },
    },
    {
      say: "勤務できない日は、単発の代理入力から、勤務不可として登録します。勤務不可は、管理者だけが入力できます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("単発の代理入力"));
      },
    },
  ],
};

export const employees: Scenario = {
  id: "08_従業員を登録してログインを発行する",
  title: "従業員を登録してログインを発行する",
  login: MANUAL_ADMIN,
  start: "/admin/employees",
  steps: [
    { say: "新しく入った職員の登録と、スマホでログインするための、IDの発行のしかたを説明します。" },
    {
      say: "メニューの従業員を開き、右上の、新規登録を押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "＋ 新規登録" }));
      },
    },
    {
      say: "名前とフリガナを入れます。",
      do: async (c) => {
        await c.type(c.page.locator('input[name="lastName"]'), "見本");
        await c.type(c.page.locator('input[name="firstName"]'), "さくら");
        await c.type(c.page.locator('input[name="lastNameKana"]'), "ミホン");
        await c.type(c.page.locator('input[name="firstNameKana"]'), "サクラ");
      },
    },
    {
      say: "所属する拠点と、職種、雇用形態を選びます。応援で入る事業所があれば、ここでチェックします。",
      do: async (c) => {
        const office = c.page.locator('select[name="officeId"]');
        await c.scrollTo(office);
        await office.selectOption({ label: "デイサービス結いの心（DAY-CENTER）" });
        await c.page
          .locator('select[name="employmentType"]')
          .selectOption({ label: "パート（社保なし）" });
      },
    },
    {
      say: "入社日や、週に働く日数などを入れて、登録する、を押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "登録する" }));
        await c.page.waitForURL(/employees\/[0-9a-f-]{36}/);
      },
    },
    {
      say: "登録すると、従業員の詳しい画面になります。雇用契約、書類、研修、シフトの希望などは、上のタブで切り替えます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("link", { name: "雇用契約" }).first());
      },
    },
    {
      say: "スマホで使ってもらうには、ログインを発行する、を押します。IDと初期パスワードが一度だけ表示されるので、本人に伝えてください。",
      do: async (c) => {
        const btn = c.page.getByRole("button", { name: /ログインを発行する/ });
        await c.scrollTo(btn);
        await c.click(btn);
        await c.page
          .getByText(/初期パスワード/)
          .first()
          .waitFor();
      },
    },
    {
      say: "何人分もまとめて発行するときは、従業員の一覧の、ログイン発行から行えます。発行結果は印刷して、本人に渡せます。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "従業員" }).first());
        await c.highlight(c.page.getByRole("link", { name: "ログイン発行" }));
      },
    },
  ],
};

export const paidLeave: Scenario = {
  id: "09_有給を確認する",
  title: "有給を確認する",
  login: MANUAL_ADMIN,
  start: "/admin/leave",
  steps: [
    { say: "有給の残りの日数と、年5日の取得義務の確認のしかたを説明します。" },
    {
      say: "メニューの有給管理を開くと、一人ずつの残りの日数と、次に付与される日が並びます。",
      do: async (c) => {
        await c.highlight(c.page.locator("table").first());
      },
    },
    {
      say: "付与の日が来た人がいると、自動付与を実行、のボタンに件数が出ます。押すと、法律どおりの日数がまとめて付与されます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: /自動付与を実行/ }));
      },
    },
    {
      say: "詳細を押すと、付与と消化の履歴が見られます。入社時の調整などは、ここから手動で付与できます。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "詳細" }).first());
      },
    },
    {
      say: "年5日取得アラートでは、年に5日の有給を取れていない人が、期限の近い順に出ます。違反や要対応の人には、早めに声をかけてください。",
      do: async (c) => {
        await c.page.goto(`${new URL(c.page.url()).origin}/admin/leave/alerts`, {
          waitUntil: "networkidle",
        });
        await c.highlight(c.page.locator("table").first());
      },
    },
  ],
};
