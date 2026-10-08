import { FIRST_LOGIN_STAFF, MANUAL_STAFF } from "../accounts";
import type { Scenario } from "../video";

export const firstLogin: Scenario = {
  id: "11_はじめてのログイン",
  title: "はじめてのログイン（職員）",
  login: null,
  mobile: true,
  start: "/login",
  steps: [
    { say: "自分のスマホで、はじめてクロスシフトにログインするときの手順を説明します。" },
    {
      say: "管理者から渡された、IDと初期パスワードを入れて、ログインを押します。",
      do: async (c) => {
        await c.type(c.page.locator('input[name="identifier"]'), FIRST_LOGIN_STAFF.identifier);
        await c.type(c.page.locator('input[name="password"]'), FIRST_LOGIN_STAFF.password);
        await c.click(c.page.getByRole("button", { name: "ログイン" }));
        await c.page.waitForURL(/password-change/);
      },
    },
    {
      say: "はじめてのときは、パスワードの変更画面が出ます。今のパスワードと、新しいパスワードを2回入れます。新しいパスワードは8文字以上にしてください。",
      do: async (c) => {
        await c.type(c.page.locator('input[name="currentPassword"]'), FIRST_LOGIN_STAFF.password);
        await c.type(c.page.locator('input[name="newPassword"]'), "mihon2026");
        await c.type(c.page.locator('input[name="confirmPassword"]'), "mihon2026");
      },
    },
    {
      say: "パスワードを変更する、を押して、続ける、を押すと、ホームが開きます。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "パスワードを変更する" }));
        await c.click(c.page.getByRole("link", { name: /変更後はこちらから続ける/ }));
        await c.page.waitForURL(/\/me/);
      },
    },
    {
      say: "ホームから、シフトを見る、シフト希望を出す、研修アンケートに答える、ことができます。ブラウザのお気に入りに登録しておくと便利です。",
    },
  ],
};

export const staffShifts: Scenario = {
  id: "12_シフトを見る・シフト希望を出す",
  title: "シフトを見る・シフト希望を出す（職員）",
  login: MANUAL_STAFF,
  mobile: true,
  start: "/me",
  steps: [
    { say: "自分のシフトの見かたと、休みの希望の出しかたを説明します。" },
    {
      say: "ホームの、今月のシフトを見る、を押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "今月のシフトを見る" }));
      },
    },
    {
      say: "上に、勤務の日数と公休の日数、下に、毎日のシフトと時間が出ます。今日の行は黄色です。矢印で、前の月や次の月に切り替えられます。",
      do: async (c) => {
        await c.page.mouse.wheel(0, 300);
      },
    },
    {
      say: "まだ公開されていない月は、表示されません。公開されるまで、お待ちください。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: /ホーム/ }));
      },
    },
    {
      say: "休みの希望を出すときは、シフト希望を出す、を押します。",
      do: async (c) => {
        await c.click(c.page.getByRole("link", { name: "シフト希望を出す" }));
      },
    },
    {
      say: "希望休を選んでから、休みたい日を押します。もう一度押すと外れます。正社員は月3日、パートは月5日までです。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "希望休", exact: true }).first());
        await c.click(c.page.getByRole("button", { name: "15", exact: true }));
        await c.click(c.page.getByRole("button", { name: "22", exact: true }));
      },
    },
    {
      say: "最後に、保存を押します。希望は、管理者が確認してから確定します。下の、提出状況で、承認されたかどうかがわかります。",
      do: async (c) => {
        await c.click(c.page.getByRole("button", { name: "保存", exact: true }));
        await c.page.getByText(/保存しました/).waitFor();
        await c.scrollTo(c.page.getByText("この月の提出状況"));
      },
    },
  ],
};
