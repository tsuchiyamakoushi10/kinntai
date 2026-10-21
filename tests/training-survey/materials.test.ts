import { describe, expect, it } from "vitest";

import {
  checkMaterialFile,
  checkMaterials,
  isMaterialStorageKey,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS,
  materialStorageKey,
  opensInline,
  unviewedMaterials,
  youTubeId,
} from "@/lib/training-survey/materials";

const KEY = materialStorageKey("0f8fad5b-d9cb-469f-a165-70867728950e");

describe("youTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    [" https://youtu.be/dQw4w9WgXcQ ", "dQw4w9WgXcQ"],
  ])("%s → %s", (url, id) => {
    expect(youTubeId(url)).toBe(id);
  });

  it.each([
    "https://vimeo.com/123456",
    "https://www.youtube.com/channel/UCxxxx",
    "https://www.youtube.com/watch?v=short",
    "https://evil.example.com/watch?v=dQw4w9WgXcQ",
    "not a url",
  ])("%s は YouTube 動画ではない", (url) => {
    expect(youTubeId(url)).toBeNull();
  });
});

describe("checkMaterialFile", () => {
  it.each([
    ["資料.pdf", "application/pdf"],
    ["手順書.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["名簿.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["スライド.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["写真.jpeg", "image/jpeg"],
  ])("%s は添付できる", (fileName, mime) => {
    expect(checkMaterialFile({ fileName, size: 1000 })).toEqual({ ok: true, value: mime });
  });

  it("動画ファイルや実行ファイルは添付できない", () => {
    expect(checkMaterialFile({ fileName: "研修.mp4", size: 1000 }).ok).toBe(false);
    expect(checkMaterialFile({ fileName: "setup.exe", size: 1000 }).ok).toBe(false);
    expect(checkMaterialFile({ fileName: "拡張子なし", size: 1000 }).ok).toBe(false);
  });

  it("20MB ちょうどまで。超えたら・空なら弾く", () => {
    expect(checkMaterialFile({ fileName: "a.pdf", size: MAX_MATERIAL_BYTES }).ok).toBe(true);
    expect(checkMaterialFile({ fileName: "a.pdf", size: MAX_MATERIAL_BYTES + 1 }).ok).toBe(false);
    expect(checkMaterialFile({ fileName: "a.pdf", size: 0 }).ok).toBe(false);
  });
});

describe("isMaterialStorageKey", () => {
  it("training-materials/<uuid> だけを受け付ける", () => {
    expect(isMaterialStorageKey(KEY)).toBe(true);
    expect(isMaterialStorageKey("employees/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
    expect(isMaterialStorageKey("training-materials/../employees/x")).toBe(false);
    expect(isMaterialStorageKey("training-materials/")).toBe(false);
  });
});

describe("checkMaterials", () => {
  it("未指定は資料なし", () => {
    expect(checkMaterials(undefined)).toEqual({ ok: true, value: [] });
  });

  it("ファイルとリンクを整え、表示名が空なら補う", () => {
    const r = checkMaterials([
      {
        id: "",
        kind: "FILE",
        title: " ",
        storageKey: KEY,
        fileName: "感染症対策.pdf",
        sizeBytes: 5000,
      },
      { id: "m1", kind: "LINK", title: "", url: "https://youtu.be/dQw4w9WgXcQ", mustView: false },
      { id: "", kind: "LINK", title: "", url: "https://example.com/doc" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]).toMatchObject({
      kind: "FILE",
      title: "感染症対策",
      mimeType: "application/pdf",
      sizeBytes: 5000,
      mustView: true,
    });
    expect(r.value[1]).toMatchObject({ id: "m1", title: "研修動画", mustView: false });
    expect(r.value[2]).toMatchObject({ title: "リンク", mustView: true });
  });

  it("http(s) 以外の URL や空の URL を弾く", () => {
    expect(checkMaterials([{ kind: "LINK", url: "" }]).ok).toBe(false);
    expect(checkMaterials([{ kind: "LINK", url: "javascript:alert(1)" }]).ok).toBe(false);
    expect(checkMaterials([{ kind: "LINK", url: "youtube.com/watch?v=x" }]).ok).toBe(false);
  });

  it("よそのストレージキーや添付できない種類のファイルを弾く", () => {
    expect(
      checkMaterials([
        { kind: "FILE", storageKey: "employees/x", fileName: "a.pdf", sizeBytes: 10 },
      ]).ok,
    ).toBe(false);
    expect(
      checkMaterials([{ kind: "FILE", storageKey: KEY, fileName: "a.mp4", sizeBytes: 10 }]).ok,
    ).toBe(false);
  });

  it(`${MAX_MATERIALS} 個を超えたら弾く`, () => {
    const many = Array.from({ length: MAX_MATERIALS + 1 }, () => ({
      kind: "LINK",
      url: "https://example.com",
    }));
    expect(checkMaterials(many).ok).toBe(false);
  });
});

describe("unviewedMaterials", () => {
  it("見ないと回答できない資料のうち、見ていないものだけ", () => {
    const ms = [
      { id: "a", mustView: true },
      { id: "b", mustView: true },
      { id: "c", mustView: false },
    ];
    expect(unviewedMaterials(ms, new Set(["a"])).map((m) => m.id)).toEqual(["b"]);
    expect(unviewedMaterials(ms, new Set(["a", "b"]))).toEqual([]);
  });
});

describe("opensInline", () => {
  it("PDF と画像はブラウザで開く、Office は保存", () => {
    expect(opensInline("application/pdf")).toBe(true);
    expect(opensInline("image/png")).toBe(true);
    expect(opensInline("application/vnd.ms-excel")).toBe(false);
  });
});
