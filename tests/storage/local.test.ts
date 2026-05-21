import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalFileStorage } from "@/lib/storage/local";

describe("LocalFileStorage", () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kinntai-storage-"));
    storage = new LocalFileStorage(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("put → get で同じバイト列が読み出せる", async () => {
    const body = Buffer.from("hello employee documents");
    const { storageKey, size } = await storage.put({
      key: "employees/abc/file-1",
      body,
      contentType: "text/plain",
    });
    expect(storageKey).toBe("employees/abc/file-1");
    expect(size).toBe(body.length);

    const got = await storage.get("employees/abc/file-1");
    expect(got).not.toBeNull();
    expect(got?.body.equals(body)).toBe(true);
    expect(got?.contentType).toBe("text/plain");
  });

  it("存在しない key は null を返す", async () => {
    expect(await storage.get("missing")).toBeNull();
  });

  it("delete 後は読み出せない", async () => {
    await storage.put({ key: "k1", body: Buffer.from("x"), contentType: "text/plain" });
    await storage.delete("k1");
    expect(await storage.get("k1")).toBeNull();
  });

  it("パストラバーサル ( ../etc/passwd ) は拒否する", async () => {
    await expect(
      storage.put({ key: "../escape", body: Buffer.from("x"), contentType: "text/plain" }),
    ).rejects.toThrow();
    await expect(storage.get("../escape")).rejects.toThrow();
  });

  it("空 key を渡すと UUID を採番して保存する", async () => {
    const { storageKey } = await storage.put({
      key: "",
      body: Buffer.from("x"),
      contentType: "text/plain",
    });
    expect(storageKey).toMatch(/^[0-9a-f-]{36}$/);
    const got = await storage.get(storageKey);
    expect(got).not.toBeNull();
  });
});
