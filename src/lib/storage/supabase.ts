import type { ObjectStorage, ObjectStat, StoragePutResult, UploadTarget } from "./index";

/**
 * Supabase Storage (非公開バケット) に置く実装。本番 (Vercel) 用。
 *
 * - SDK は使わず Storage の REST API を fetch で呼ぶ (依存を増やさないため)。
 * - サーバーからは service_role キーで操作する。キーはブラウザに渡さない。
 * - 大きなファイルはブラウザから署名つき URL へ直接アップロードさせる
 *   (Vercel の関数はリクエストの大きさに 4.5MB の上限があるため)。
 * - バケットが無ければ最初の操作で非公開バケットとして作る。
 */
export class SupabaseStorage implements ObjectStorage {
  private readonly base: string;
  private bucketReady: Promise<void> | null = null;

  constructor(
    url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
    /** バケット作成時のファイル上限 (バイト) */
    private readonly fileSizeLimit: number,
  ) {
    this.base = `${url.replace(/\/+$/, "")}/storage/v1`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private objectPath(key: string): string {
    return `${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const res = await fetch(`${this.base}/bucket/${encodeURIComponent(this.bucket)}`, {
        headers: this.headers(),
      });
      if (res.ok) return;
      const created = await fetch(`${this.base}/bucket`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: this.bucket,
          name: this.bucket,
          public: false,
          file_size_limit: this.fileSizeLimit,
        }),
      });
      // 並行して作られた場合は 400/409 (already exists) になるので通す
      if (!created.ok && created.status !== 409 && created.status !== 400) {
        throw new Error(`storage bucket create failed: ${created.status}`);
      }
    })().catch((err: unknown) => {
      this.bucketReady = null;
      throw err;
    });
    return this.bucketReady;
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
    await this.ensureBucket();
    const res = await fetch(`${this.base}/object/${this.objectPath(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`storage put failed: ${res.status}`);
    return { storageKey: key, size: body.length };
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const res = await fetch(`${this.base}/object/authenticated/${this.objectPath(key)}`, {
      headers: this.headers(),
    });
    // 見つからないとき Supabase は 400 か 404 を返す
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`storage get failed: ${res.status}`);
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(`${this.base}/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`storage delete failed: ${res.status}`);
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const res = await fetch(`${this.base}/object/authenticated/${this.objectPath(key)}`, {
      method: "HEAD",
      headers: this.headers(),
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`storage stat failed: ${res.status}`);
    return {
      size: Number(res.headers.get("content-length") ?? 0),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async createUploadUrl(key: string, contentType: string): Promise<UploadTarget> {
    await this.ensureBucket();
    const res = await fetch(`${this.base}/object/upload/sign/${this.objectPath(key)}`, {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`storage upload sign failed: ${res.status}`);
    const { url } = (await res.json()) as { url: string };
    return { url: `${this.base}${url}`, headers: { "Content-Type": contentType } };
  }

  async createDownloadUrl(
    key: string,
    opts: { fileName: string; inline: boolean; ttlSeconds: number },
  ): Promise<string> {
    const res = await fetch(`${this.base}/object/sign/${this.objectPath(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: opts.ttlSeconds }),
    });
    if (!res.ok) throw new Error(`storage sign failed: ${res.status}`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    const url = `${this.base}${signedURL}`;
    // download= を付けると「保存」になり、ファイル名も元の名前になる
    return opts.inline ? url : `${url}&download=${encodeURIComponent(opts.fileName)}`;
  }
}
