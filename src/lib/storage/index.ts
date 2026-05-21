/**
 * 書類ファイル等のオブジェクトストレージ抽象化。
 *
 * MVP はローカル FS 実装のみ (`LocalFileStorage`)。
 * 本番では Supabase Storage / S3 互換に差し替える前提でインターフェースを切ってある。
 *
 * 設計メモ:
 * - ファイル本体は外部に置き、DB (`employee_documents`) には `storage_key` のみ保持する。
 * - ダウンロードは固定 URL を画面に出さず、毎回 HMAC 署名トークン経由で発行する
 *   (`createSignedToken` / `verifySignedToken`)。
 * - PII を扱うため、`storage_key` は `employees/<employeeId>/<uuid>` 形式の不透明値を推奨。
 */

import { LocalFileStorage } from "./local";

export type StoragePutResult = {
  storageKey: string;
  size: number;
};

export interface ObjectStorage {
  /** バイト列を保存し、生成した storage_key と実サイズを返す。 */
  put(args: { key: string; body: Buffer; contentType: string }): Promise<StoragePutResult>;
  /** 保存内容を読み出す。存在しなければ null。 */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  /** 物理削除。 */
  delete(key: string): Promise<void>;
}

let cachedStorage: ObjectStorage | null = null;

/**
 * driver は環境変数で切り替えられる想定だが、MVP はローカル FS のみ。
 * テストや並列実行でディレクトリを衝突させたいときは `STORAGE_LOCAL_ROOT` を上書きする。
 */
export function getObjectStorage(): ObjectStorage {
  if (!cachedStorage) {
    cachedStorage = new LocalFileStorage(process.env.STORAGE_LOCAL_ROOT ?? "./storage");
  }
  return cachedStorage;
}

/** テスト用にインスタンスを差し替える / リセットする。 */
export function _resetObjectStorageForTest(driver: ObjectStorage | null) {
  cachedStorage = driver;
}

export { LocalFileStorage } from "./local";
export { createSignedToken, verifySignedToken, SIGNED_URL_TTL_SECONDS } from "./signed-token";
