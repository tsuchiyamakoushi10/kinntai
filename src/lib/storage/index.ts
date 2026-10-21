/**
 * 書類ファイル等のオブジェクトストレージ抽象化。
 *
 * - 開発: ローカル FS (`LocalFileStorage`)
 * - 本番: Supabase Storage (`SupabaseStorage`)。`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`
 *   があれば自動でこちらを使う。Vercel はサーバー内にファイルを残せないため必須。
 *
 * 設計メモ:
 * - ファイル本体は外部に置き、DB (`employee_documents`) には `storage_key` のみ保持する。
 * - ダウンロードは固定 URL を画面に出さず、毎回 HMAC 署名トークン経由で発行する
 *   (`createSignedToken` / `verifySignedToken`)。
 * - PII を扱うため、`storage_key` は `employees/<employeeId>/<uuid>` 形式の不透明値を推奨。
 */

import { LocalFileStorage } from "./local";
import { SupabaseStorage } from "./supabase";

export type StoragePutResult = {
  storageKey: string;
  size: number;
};

export type ObjectStat = { size: number; contentType: string };

/** ブラウザから PUT でアップロードする先 */
export type UploadTarget = { url: string; headers: Record<string, string> };

/** Supabase のバケット作成時に付けるファイル上限。研修資料 (20MB) より大きくしておく */
const BUCKET_FILE_SIZE_LIMIT = 25 * 1024 * 1024;

export interface ObjectStorage {
  /** バイト列を保存し、生成した storage_key と実サイズを返す。 */
  put(args: { key: string; body: Buffer; contentType: string }): Promise<StoragePutResult>;
  /** 保存内容を読み出す。存在しなければ null。 */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  /** 物理削除。 */
  delete(key: string): Promise<void>;
  /** 大きさと種類。存在しなければ null。 */
  stat(key: string): Promise<ObjectStat | null>;
  /** ブラウザから直接アップロードさせるための署名つき URL。 */
  createUploadUrl(key: string, contentType: string): Promise<UploadTarget>;
  /** 短時間だけ有効な読み出し URL。inline=false なら保存 (元のファイル名) になる。 */
  createDownloadUrl(
    key: string,
    opts: { fileName: string; inline: boolean; ttlSeconds: number },
  ): Promise<string>;
}

let cachedStorage: ObjectStorage | null = null;

/**
 * Supabase の設定があれば Supabase Storage、なければローカル FS。
 * テストや並列実行でディレクトリを衝突させたいときは `STORAGE_LOCAL_ROOT` を上書きする。
 */
export function getObjectStorage(): ObjectStorage {
  if (!cachedStorage) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      cachedStorage = new SupabaseStorage(
        url,
        key,
        process.env.STORAGE_BUCKET ?? "kinntai",
        BUCKET_FILE_SIZE_LIMIT,
      );
    } else if (process.env.VERCEL) {
      throw new Error(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定のためファイルを保存できません",
      );
    } else {
      cachedStorage = new LocalFileStorage(process.env.STORAGE_LOCAL_ROOT ?? "./storage");
    }
  }
  return cachedStorage;
}

/** テスト用にインスタンスを差し替える / リセットする。 */
export function _resetObjectStorageForTest(driver: ObjectStorage | null) {
  cachedStorage = driver;
}

export { LocalFileStorage } from "./local";
export { SupabaseStorage } from "./supabase";
export { createSignedToken, verifySignedToken, SIGNED_URL_TTL_SECONDS } from "./signed-token";
