import { MANUAL_ADMIN, MANUAL_STAFF } from "../accounts";
import type { Scenario } from "../video";

/** 研修アンケートを作って配る */
export const surveyCreate: Scenario = {
  id: "05_研修アンケートを作って配る",
  title: "研修アンケートを作って配る",
  login: MANUAL_ADMIN,
  start: "/admin/training-surveys",
  steps: [
    {
      say: "研修アンケートの作り方と、配り方を説明します。グーグルフォームのように質問を自由に組み立てて、職員のマイページに配ることができます。",
    },
    {
      say: "左のメニューの、研修アンケートを開き、新しく作る、を押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "＋ 新しく作る" }));
      },
    },
    {
      say: "研修名と研修日を入れます。回答した職員には、この研修名と日付で、研修記録が自動で付きます。",
      do: async (c) => {
        await c.type(c.page.getByPlaceholder("例: 移乗介助の研修"), "認知症ケアの研修");
      },
    },
    {
      say: "最初から、よく使う質問が3つ入っています。質問の文や種類は、自由に変えられます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByLabel("質問1の文"));
        await c.highlight(c.page.getByLabel("質問の種類").first());
      },
    },
    {
      say: "質問と質問の間にある、ここに追加、を押すと、好きな場所に質問を入れられます。ここでは、ひとつ選ぶ質問を足します。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "＋ ここに追加" }).last());
        await c.click(c.page.getByRole("button", { name: "ひとつ選ぶ", exact: true }));
      },
    },
    {
      say: "質問の文と、選択肢を入れます。選択肢の欄でエンターキーを押すと、次の選択肢が増えます。",
      do: async (c) => {
        await c.type(c.page.getByLabel("質問4の文"), "研修の長さはどうでしたか？");
        await c.type(c.page.getByRole("textbox", { name: "選択肢1" }), "短い");
        await c.type(c.page.getByRole("textbox", { name: "選択肢2" }), "ちょうどよい");
        await c.page.getByRole("textbox", { name: "選択肢2" }).press("Enter");
        await c.type(c.page.getByRole("textbox", { name: "選択肢3" }), "長い");
      },
    },
    {
      say: "質問の左にある、つまみを持って上下に動かすと、順番を入れ替えられます。複製ボタンで、同じ質問をもう1つ作ることもできます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: /質問4をドラッグ/ }));
        await c.highlight(c.page.getByRole("button", { name: "複製" }).last());
      },
    },
    {
      say: "よく使う質問がそろったら、ひな形として保存しておくと、次からは選ぶだけで使えます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByRole("button", { name: "この質問をひな形として保存" }));
        await c.highlight(c.page.getByRole("button", { name: "この質問をひな形として保存" }));
      },
    },
    {
      say: "最後に、配る相手を選びます。事業所ごとに全員を選ぶことも、一人ずつ選ぶこともできます。",
      do: async (c) => {
        const box = c.page
          .locator("details")
          .filter({ has: c.page.locator("summary", { hasText: "ナーシングホーム" }) });
        await c.scrollTo(box);
        await c.click(box.locator("summary"));
        await c.click(box.getByText("この拠点の全員"));
      },
    },
    {
      say: "保存する、を押すと、下書きとして保存されます。まだ職員には見えません。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "保存する" }));
        await c.page.waitForURL(/training-surveys\/[0-9a-f-]{36}$/);
      },
    },
    {
      say: "配信する、を押すと、選んだ職員のマイページに、アンケートが届きます。",
      do: async (c) => {
        c.page.once("dialog", (d) => void d.accept());
        await c.click(c.page.getByRole("button", { name: "配信する" }));
        await c.page.getByRole("button", { name: "締め切る" }).waitFor();
      },
    },
  ],
};

/** 研修アンケートの結果を見る */
export const surveyResults: Scenario = {
  id: "06_研修アンケートの結果を見る",
  title: "研修アンケートの結果を見る",
  login: MANUAL_ADMIN,
  start: "/admin/training-surveys",
  steps: [
    {
      say: "研修アンケートの結果の見方を説明します。まとめ、個別、未回答の、3つの見方があります。",
    },
    {
      say: "一覧では、それぞれのアンケートに、何人中何人が答えたかが出ます。結果を見る、を押します。",
      do: async (c) => {
        await c.highlight(c.page.getByText(/回答 \d+ \/ \d+人/).first());
        const row = c.page.locator("li").filter({ hasText: "感染症対策の研修" });
        await c.click(row.getByRole("link", { name: "結果を見る" }));
      },
    },
    {
      say: "まとめでは、質問ごとに結果が縦に並びます。数の評価は、平均点と、それぞれの数字を選んだ人数が、棒で出ます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("平均（5点満点）"));
      },
    },
    {
      say: "選択肢の質問は、選んだ人数です。その他に書かれた内容も、名前つきで出ます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("明日から実践したいことはどれですか？"));
      },
    },
    {
      say: "表形式の質問は、項目ごとに、一番多かった答えが青く光ります。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("講師の評価"));
      },
    },
    {
      say: "自由記述は、書いた人の名前と一緒に並びます。",
      do: async (c) => {
        await c.scrollTo(c.page.getByText("感想・質問があれば書いてください"));
      },
    },
    {
      say: "個別、を押すと、一人分の回答を1枚で見られます。左の名前を押すか、次の人、で切り替えます。",
      do: async (c) => {
        await c.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await c.click(c.page.getByRole("tab", { name: /個別/ }));
        await c.click(c.page.getByRole("link", { name: /次の人/ }));
      },
    },
    {
      say: "未回答、を押すと、まだ答えていない人がわかります。声をかけるときに使ってください。",
      do: async (c) => {
        await c.click(c.page.getByRole("tab", { name: /未回答/ }));
      },
    },
    {
      say: "回答を締め切るときは、締め切る、を押します。あとから再開することもできます。",
      do: async (c) => {
        await c.highlight(c.page.getByRole("button", { name: "締め切る" }));
      },
    },
  ],
};

/** 職員: 研修アンケートに答える */
export const surveyAnswer: Scenario = {
  id: "13_研修アンケートに答える",
  title: "研修アンケートに答える",
  login: MANUAL_STAFF,
  mobile: true,
  start: "/me",
  steps: [
    { say: "研修アンケートの答え方を説明します。自分のスマホで、マイページを開いてください。" },
    {
      say: "答えていないアンケートがあると、ホームの上に、黄色いお知らせが出ます。答える、を押します。",
      do: async (c) => {
        await c.click(c.page.getByText(/研修アンケートが \d+件 あります/));
      },
    },
    {
      say: "答えるアンケートを押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: /感染症対策の研修/ }));
      },
    },
    {
      say: "数字の質問は、大きな数字のボタンを押します。",
      do: async (c) => {
        await c.click(
          c.page.locator("fieldset").nth(0).getByRole("button", { name: "4", exact: true }),
        );
      },
    },
    {
      say: "あてはまるものを選ぶ質問は、いくつでも押せます。その他を選ぶと、内容を書く欄が出ます。",
      do: async (c) => {
        const f = c.page.locator("fieldset").nth(1);
        await c.click(f.getByRole("button", { name: /手指消毒のタイミング/ }));
        await c.click(f.getByRole("button", { name: /換気/ }));
      },
    },
    {
      say: "表の形の質問は、項目ごとに1つずつ選びます。",
      do: async (c) => {
        const f = c.page.locator("fieldset").nth(2);
        await c.click(f.getByRole("button", { name: "話し方：よい" }));
        await c.click(f.getByRole("button", { name: "資料：よい" }));
        await c.click(f.getByRole("button", { name: "時間配分：ふつう" }));
      },
    },
    {
      say: "感想などは、自由に書きます。必須と書かれた質問は、必ず答えてください。",
      do: async (c) => {
        const t = c.page.locator("fieldset").nth(3).locator("textarea");
        await c.type(t, "とてもわかりやすかったです。");
      },
    },
    {
      say: "最後に、送信する、を押します。これで完了です。締め切りまでなら、もう一度開いて直すこともできます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "送信する" }));
        await c.page.getByText("送信しました").waitFor();
      },
    },
  ],
};
