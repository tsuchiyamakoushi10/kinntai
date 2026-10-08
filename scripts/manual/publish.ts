/**
 * 作ったマニュアル PDF と動画をアプリの「使い方」画面に入れる。
 *
 * 実行: pnpm manual:publish   (manual:video と manual:pdf の後に)
 * 出力: public/manual/{admin,staff}/ (ファイル名は URL に使うので英数字に置き換える)
 *       src/lib/manual/catalog.ts (画面に出す一覧。手で直さない)
 *
 * public/manual/admin/ は管理者だけが開ける (src/middleware.ts)。
 */
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { SCENARIOS } from "./scenarios";
import { OUT_DIR } from "./video";
import { VOICE_CREDIT } from "./voicevox";

const ROOT = resolve(__dirname, "../..");
const PUBLIC_DIR = join(ROOT, "public/manual");
const CATALOG = join(ROOT, "src/lib/manual/catalog.ts");

const PDFS = [
  { audience: "admin", src: "CrossShift_管理者マニュアル.pdf", title: "管理者マニュアル" },
  { audience: "staff", src: "CrossShift_職員マニュアル.pdf", title: "職員マニュアル" },
] as const;

/** 01〜09 は管理者向け、11〜 は職員向け (scenarios/index.ts の並び) */
function audienceOf(id: string): "admin" | "staff" {
  return Number(id.slice(0, 2)) >= 10 ? "staff" : "admin";
}

/** 画面ではどちら向けかを見出しで分けるので、題名の「（管理者）」などは外す */
function displayTitle(title: string): string {
  return title.replace(/（(管理者|職員)）$/, "");
}

/** 動画の長さ (秒) と縦横の大きさ。職員向けはスマホ画面なので縦長になる */
function probe(file: string): { durationSec: number; width: number; height: number } {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    file,
  ]);
  const j = JSON.parse(out.toString()) as {
    streams: { width: number; height: number }[];
    format: { duration: string };
  };
  const stream = j.streams[0];
  if (!stream) throw new Error(`映像が入っていません: ${file}`);
  return {
    durationSec: Math.round(Number(j.format.duration)),
    width: stream.width,
    height: stream.height,
  };
}

async function main(): Promise<void> {
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(join(PUBLIC_DIR, "admin"), { recursive: true });
  await mkdir(join(PUBLIC_DIR, "staff"), { recursive: true });

  const pdfs = [];
  for (const p of PDFS) {
    const href = `/manual/${p.audience}/manual.pdf`;
    await copyFile(join(OUT_DIR, p.src), join(ROOT, "public", href));
    pdfs.push({ audience: p.audience, title: p.title, href });
  }

  const videos = [];
  for (const s of SCENARIOS) {
    const src = join(OUT_DIR, "videos", `${s.id}.mp4`);
    const audience = audienceOf(s.id);
    const href = `/manual/${audience}/${s.id.slice(0, 2)}.mp4`;
    await copyFile(src, join(ROOT, "public", href));
    // 再生前に見せる表紙 (冒頭の題名の場面)。動画本体は再生するまで読み込まない
    const poster = href.replace(/\.mp4$/, ".jpg");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      "1",
      "-i",
      src,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      join(ROOT, "public", poster),
    ]);
    videos.push({
      audience,
      title: displayTitle(s.title),
      href,
      poster,
      ...probe(src),
    });
  }

  await mkdir(join(ROOT, "src/lib/manual"), { recursive: true });
  await writeFile(
    CATALOG,
    `// pnpm manual:publish が作るファイル。手で直さない (scripts/manual/publish.ts)。
import type { ManualCatalog } from "./types";

export const MANUAL_CATALOG: ManualCatalog = ${JSON.stringify({ pdfs, videos, voiceCredit: VOICE_CREDIT }, null, 2)};
`,
  );
  execFileSync("pnpm", ["exec", "prettier", "--write", CATALOG], { stdio: "inherit" });
  console.log(`✓ PDF ${pdfs.length} 冊・動画 ${videos.length} 本を public/manual に入れました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
