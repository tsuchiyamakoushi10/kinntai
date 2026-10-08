/**
 * 操作説明動画をまとめて作る。
 *
 * 実行: pnpm manual:video            (全部)
 *       pnpm manual:video 03 05       (ファイル名の先頭番号で絞り込み)
 * 前提: pnpm dev (ローカル) と VOICEVOX エンジン (docs/manual/README.md) が起動していること。
 */
import { SCENARIOS } from "./scenarios";
import { makeVideo } from "./video";

async function main(): Promise<void> {
  const filters = process.argv.slice(2);
  const targets = SCENARIOS.filter(
    (s) => filters.length === 0 || filters.some((f) => s.id.startsWith(f)),
  );
  const failed: string[] = [];
  for (const s of targets) {
    const started = Date.now();
    try {
      const out = await makeVideo(s);
      console.log(`✓ ${s.id} (${Math.round((Date.now() - started) / 1000)}秒) → ${out}`);
    } catch (e) {
      // 1 本失敗しても残りは作る
      failed.push(s.id);
      console.error(`✗ ${s.id}: ${String(e)}`);
    }
  }
  if (failed.length > 0) {
    console.error(`作れなかった動画: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
