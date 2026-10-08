/**
 * VOICEVOX エンジン (ローカルの docker) で日本語の音声を作る。
 *
 * 起動: docker run -d --rm -p 50021:50021 --name voicevox voicevox/voicevox_engine:cpu-ubuntu20.04-0.21.1
 * 同じ文は dist/manual/.cache に WAV を残して再利用する (作り直しを速くするため)。
 *
 * 利用規約: 動画内に「VOICEVOX:冥鳴ひまり」のクレジットを入れること。
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ENGINE = process.env.VOICEVOX_URL ?? "http://localhost:50021";
/** 冥鳴ひまり (ノーマル)。落ち着いた声で業務マニュアル向き */
export const SPEAKER_ID = 14;
export const VOICE_CREDIT = "VOICEVOX:冥鳴ひまり";

export type Voice = { path: string; durationMs: number };

/** WAV (PCM) の長さをヘッダから計算する */
function wavDurationMs(buf: Buffer): number {
  const byteRate = buf.readUInt32LE(28);
  // "data" チャンクを探す
  let offset = 12;
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return Math.round((size / byteRate) * 1000);
    offset += 8 + size;
  }
  throw new Error("invalid wav");
}

export async function synthesize(text: string, cacheDir: string): Promise<Voice> {
  await mkdir(cacheDir, { recursive: true });
  const key = createHash("sha1").update(`${SPEAKER_ID}:${text}`).digest("hex").slice(0, 16);
  const path = join(cacheDir, `${key}.wav`);
  if (!existsSync(path)) {
    const q = await fetch(
      `${ENGINE}/audio_query?speaker=${SPEAKER_ID}&text=${encodeURIComponent(text)}`,
      { method: "POST" },
    );
    if (!q.ok) throw new Error(`audio_query failed: ${q.status}`);
    const query = (await q.json()) as Record<string, unknown>;
    query.speedScale = 1.08;
    query.intonationScale = 1.1;
    query.prePhonemeLength = 0.1;
    query.postPhonemeLength = 0.15;
    const s = await fetch(`${ENGINE}/synthesis?speaker=${SPEAKER_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!s.ok) throw new Error(`synthesis failed: ${s.status}`);
    await writeFile(path, Buffer.from(await s.arrayBuffer()));
  }
  return { path, durationMs: wavDurationMs(await readFile(path)) };
}
