/**
 * 書類アップロード時の上限とサポート形式。
 *
 * Server Action ファイル (`actions.ts`) は "use server" のため関数しか export
 * できないので、定数はこちらに分離している。
 */

// 5 MB。書類 (履歴書 PDF / 資格証スキャン) を想定。
// 大きすぎる場合は次フェーズで分割アップロードを検討する。
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
]);
