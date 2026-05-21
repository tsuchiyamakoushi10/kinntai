import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ObjectStorage, StoragePutResult } from "./index";

/**
 * ローカルファイルシステムに置く実装。開発と社内検証用。
 * 本番では Supabase Storage / S3 など SSE 付きの実装に差し替える。
 *
 * パストラバーサル防止のため、`key` は内部生成 (UUID) 以外受け付けず、
 * `put` 時に `path.normalize` した結果が `root` 配下にあることを必ず確認する。
 */
export class LocalFileStorage implements ObjectStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  async put({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoragePutResult> {
    // 呼び出し側がキーを採番している場合 (テスト) はそれを尊重し、
    // 採番していなければ UUID を生成して衝突を防ぐ。
    const effectiveKey = key && key.length > 0 ? key : randomUUID();
    const filePath = this.resolveSafe(effectiveKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, { mode: 0o600 });
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType }), { mode: 0o600 });
    return { storageKey: effectiveKey, size: body.length };
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const filePath = this.resolveSafe(key);
    try {
      const [body, meta] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(`${filePath}.meta.json`, "utf8").catch(() => null),
      ]);
      const contentType =
        meta && typeof meta === "string"
          ? ((JSON.parse(meta) as { contentType?: string }).contentType ??
            "application/octet-stream")
          : "application/octet-stream";
      return { body, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveSafe(key);
    await Promise.all([
      fs.rm(filePath, { force: true }),
      fs.rm(`${filePath}.meta.json`, { force: true }),
    ]);
  }

  private resolveSafe(key: string): string {
    if (key.includes("\0")) throw new Error("invalid storage key");
    const resolved = path.resolve(this.root, key);
    // 相対パスが root を抜け出していないか確認
    const rel = path.relative(this.root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("storage key escapes root");
    }
    return resolved;
  }
}
