/**
 * 操作説明動画を作る: 画面を自動操作して録画 → 音声 (VOICEVOX) と字幕を重ねて MP4 にする。
 *
 * 1 本の動画 = シナリオ (scenarios/*.ts)。シナリオは「ナレーション + その間にする操作」の並び。
 * 各ステップは音声の長さだけ画面を見せるので、操作と説明がずれない。
 * 架空データのローカル環境だけで動かすこと (assertLocal)。
 */
import { execFileSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { type Browser, type Locator, type Page, chromium } from "@playwright/test";

import { synthesize, VOICE_CREDIT, type Voice } from "./voicevox";

export const BASE_URL = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";
export const OUT_DIR = resolve(__dirname, "../../dist/manual");
const CACHE_DIR = join(OUT_DIR, ".cache");
const VIDEO_SIZE = { width: 1280, height: 720 };

export type Ctx = {
  page: Page;
  /** 赤い丸のカーソルを動かしてからクリックする (見ている人が追えるように) */
  click: (target: Locator) => Promise<void>;
  /** 1 文字ずつ入力する */
  type: (target: Locator, text: string) => Promise<void>;
  /** 要素のまわりを光らせる */
  highlight: (target: Locator) => Promise<void>;
  /** 画面をゆっくりスクロールする */
  scrollTo: (target: Locator) => Promise<void>;
  /** タイトルなどの全面カードを出す */
  card: (title: string, sub?: string) => Promise<void>;
};

export type Step = {
  /** 字幕と音声になる文 (句点ごとに字幕を区切る) */
  say: string;
  /** 話している間にする操作 */
  do?: (ctx: Ctx) => Promise<void>;
};

export type Scenario = {
  id: string;
  title: string;
  /** ログインする人。null ならログインせずに始める (ログイン画面の説明用) */
  login: { identifier: string; password: string } | null;
  /** スマホ表示で録るか */
  mobile?: boolean;
  /** 最初に開くページ */
  start: string;
  steps: Step[];
};

/** 本番やステージングに向けて動かさないための確認 */
export function assertLocal(): void {
  const url = new URL(BASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`マニュアル用の録画はローカル環境だけで行います: ${BASE_URL}`);
  }
}

/** 録画に映すカーソルとクリックの波紋 */
const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    // 開発サーバーの「N」マーク (本番には出ない) を隠す
    const hide = document.createElement("style");
    hide.textContent = "nextjs-portal{display:none!important}";
    document.head.appendChild(hide);
    if (document.getElementById("__manual_cursor")) return;
    const c = document.createElement("div");
    c.id = "__manual_cursor";
    Object.assign(c.style, {
      position: "fixed", left: "-100px", top: "-100px", width: "26px", height: "26px",
      marginLeft: "-13px", marginTop: "-13px", borderRadius: "50%",
      background: "rgba(239,68,68,0.35)", border: "3px solid rgba(220,38,38,0.9)",
      zIndex: "2147483647", pointerEvents: "none", transition: "left .05s, top .05s",
    });
    document.body.appendChild(c);
    document.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed", left: e.clientX + "px", top: e.clientY + "px", width: "10px", height: "10px",
        marginLeft: "-5px", marginTop: "-5px", borderRadius: "50%", border: "3px solid rgba(220,38,38,0.9)",
        zIndex: "2147483647", pointerEvents: "none", transition: "all .45s ease-out", opacity: "1",
      });
      document.body.appendChild(r);
      requestAnimationFrame(() => Object.assign(r.style, { width: "60px", height: "60px", marginLeft: "-30px", marginTop: "-30px", opacity: "0" }));
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeCtx(page: Page, mobile: boolean): Ctx {
  const moveTo = async (target: Locator) => {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await sleep(250);
    }
  };
  return {
    page,
    click: async (target) => {
      if (mobile) {
        await target.scrollIntoViewIfNeeded();
        await sleep(300);
        await target.click();
      } else {
        await moveTo(target);
        await target.click();
        // 横に長い表で画面全体が横にずれたままにならないよう戻す
        await page.evaluate(() => window.scrollTo({ left: 0, top: window.scrollY }));
      }
      await sleep(500);
    },
    type: async (target, text) => {
      if (!mobile) await moveTo(target);
      await target.click();
      await target.fill("");
      await target.pressSequentially(text, { delay: 60 });
      await sleep(300);
    },
    highlight: async (target) => {
      await target.scrollIntoViewIfNeeded();
      await target.evaluate((el) => {
        const prev = (el as HTMLElement).style.boxShadow;
        (el as HTMLElement).style.transition = "box-shadow .3s";
        (el as HTMLElement).style.boxShadow =
          "0 0 0 4px rgba(250,204,21,.95), 0 0 0 9px rgba(250,204,21,.35)";
        setTimeout(() => ((el as HTMLElement).style.boxShadow = prev), 2600);
      });
      await sleep(400);
    },
    scrollTo: async (target) => {
      await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await sleep(900);
    },
    card: async (title, sub) => {
      await page.setContent(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;font-family:'Noto Sans CJK JP','IPAGothic',sans-serif;text-align:center;padding:0 40px">
        <div style="font-size:18px;letter-spacing:.2em;opacity:.75">CrossShift 操作説明</div>
        <div style="font-size:${mobile ? 30 : 46}px;font-weight:700;margin-top:16px;line-height:1.35">${title}</div>
        ${sub ? `<div style="font-size:${mobile ? 16 : 20}px;margin-top:18px;opacity:.85;line-height:1.6">${sub}</div>` : ""}
      </body></html>`);
    },
  };
}

/** 字幕を句点で区切り、音声の長さを文字数で配分する */
function splitCaptions(text: string, startMs: number, durationMs: number) {
  const parts = text
    .match(/[^。！？]+[。！？]?/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = startMs;
  return parts.map((p) => {
    const d = Math.round((durationMs * p.length) / total);
    const seg = { start: t, end: t + d, text: p };
    t += d;
    return seg;
  });
}

function assTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** 1 行が長すぎる字幕は、行の長さがそろうように折り返す。句読点で始まる行は作らない */
function wrap(text: string, max: number): string {
  if (text.length <= max) return text;
  const lines = Math.ceil(text.length / max);
  const per = Math.ceil(text.length / lines);
  const out: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    let cut = Math.min(per, rest.length);
    // 次の行の頭が句読点・閉じかっこなら、この行に含める
    while (cut < rest.length && /[、。，．！？」）]/.test(rest[cut]!)) cut += 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return out.join("\\N");
}

function buildAss(
  segments: { start: number; end: number; text: string }[],
  w: number,
  h: number,
  mobile: boolean,
): string {
  const fontSize = mobile ? 34 : 40;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK JP,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB4000000,1,0,0,0,100,100,0,0,3,10,0,2,30,30,${mobile ? 60 : 36},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${segments
  .map(
    (s) =>
      `Dialogue: 0,${assTime(s.start)},${assTime(s.end)},Default,,0,0,0,,${wrap(s.text, mobile ? 14 : 30)}`,
  )
  .join("\n")}
`;
}

async function login(
  browser: Browser,
  account: { identifier: string; password: string },
  viewport: { width: number; height: number },
) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="identifier"]', account.identifier);
  await page.fill('input[name="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|me)/);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

export async function makeVideo(s: Scenario): Promise<string> {
  assertLocal();
  const mobile = s.mobile === true;
  const viewport = mobile ? { width: 390, height: 780 } : VIDEO_SIZE;
  const steps = [
    ...s.steps,
    {
      say: "以上で説明を終わります。",
      do: async (c: Ctx) => c.card("おわり", `音声：${VOICE_CREDIT}`),
    },
  ];

  // 1. 先に全部の音声を作り、長さを知る
  const voices: Voice[] = [];
  for (const step of steps) voices.push(await synthesize(step.say, CACHE_DIR));

  // 2. 録画しながら操作する
  const workDir = join(OUT_DIR, ".work", s.id);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const timeline: { start: number; voice: Voice; say: string }[] = [];
  let webm: string;
  try {
    const storageState = s.login ? await login(browser, s.login, viewport) : undefined;
    const context = await browser.newContext({
      viewport,
      storageState,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      recordVideo: { dir: workDir, size: viewport },
    });
    await context.addInitScript(CURSOR_SCRIPT);
    const page = await context.newPage();
    const t0 = Date.now();
    const ctx = makeCtx(page, mobile);
    // 1 つ目のステップ (あいさつ) はタイトルカードを見せながら話し、2 つ目の前に最初のページを開く
    await ctx.card(s.title);
    await sleep(500);

    for (const [i, step] of steps.entries()) {
      const voice = voices[i]!;
      if (i === 1) await page.goto(`${BASE_URL}${s.start}`, { waitUntil: "networkidle" });
      const start = Date.now() - t0;
      timeline.push({ start, voice, say: step.say });
      const action = step.do
        ? step.do(ctx).catch((e: unknown) => {
            throw new Error(
              `[${s.id}] step ${i + 1}「${step.say.slice(0, 20)}…」で失敗: ${String(e)}`,
            );
          })
        : Promise.resolve();
      await Promise.all([action, sleep(voice.durationMs)]);
      await sleep(450);
    }
    await sleep(800);
    const video = page.video();
    await context.close();
    webm = (await video?.path()) ?? "";
  } finally {
    await browser.close();
  }

  // 3. 字幕 (ASS) と音声を重ねて MP4 にする
  const segments = timeline.flatMap((t) => splitCaptions(t.say, t.start, t.voice.durationMs));
  const assPath = join(workDir, "captions.ass");
  await writeFile(assPath, buildAss(segments, viewport.width, viewport.height, mobile));
  await writeFile(
    join(workDir, "captions.srt"),
    segments
      .map(
        (seg, i) =>
          `${i + 1}\n${assTime(seg.start).replace(".", ",")}0 --> ${assTime(seg.end).replace(".", ",")}0\n${seg.text}\n`,
      )
      .join("\n"),
  );

  const args = ["-y", "-i", webm];
  for (const t of timeline) args.push("-i", t.voice.path);
  const delays = timeline
    .map((t, i) => `[${i + 1}:a]adelay=${t.start}|${t.start}[a${i}]`)
    .join(";");
  const mix = `${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:normalize=0[aout]`;
  const out = join(OUT_DIR, "videos", `${s.id}.mp4`);
  await mkdir(join(OUT_DIR, "videos"), { recursive: true });
  args.push(
    "-filter_complex",
    `[0:v]subtitles=${assPath.replace(/:/g, "\\:")}[vout];${delays};${mix}`,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    `${out}.tmp.mp4`,
  );
  execFileSync("ffmpeg", args, { stdio: "pipe" });
  await rename(`${out}.tmp.mp4`, out);
  return out;
}
