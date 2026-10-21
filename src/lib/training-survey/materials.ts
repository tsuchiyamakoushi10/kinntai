/**
 * 研修資料 (ファイル / リンク) の検証 (純関数)。docs/training-survey.md §2.2。
 */

import type { Checked } from "./logic";

export type MaterialKind = "FILE" | "LINK";

export type SurveyMaterial = {
  /** 既存の資料なら DB の id、新しい資料は空文字 */
  id: string;
  kind: MaterialKind;
  /** 表示名 */
  title: string;
  /** LINK のとき。FILE は空文字 */
  url: string;
  /** FILE のとき。LINK は空文字 / 0 */
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 見ないと回答できない */
  mustView: boolean;
};

/** 1 ファイルの上限。Excel・PowerPoint の資料が入る大きさ */
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
export const MAX_MATERIALS = 20;
const MAX_TITLE = 100;
const MAX_FILE_NAME = 200;
const MAX_URL = 2000;

/** 添付できるファイル。ブラウザが送る MIME は当てにならないので拡張子で決める */
export const MATERIAL_FILE_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** <input type="file" accept> に渡す値 */
export const MATERIAL_FILE_ACCEPT = Object.keys(MATERIAL_FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

const STORAGE_PREFIX = "training-materials/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const materialStorageKey = (uuid: string): string => `${STORAGE_PREFIX}${uuid}`;
export const isMaterialStorageKey = (key: string): boolean =>
  key.startsWith(STORAGE_PREFIX) && UUID.test(key.slice(STORAGE_PREFIX.length));

const extOf = (fileName: string): string => {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
};

/** 拡張子を除いた名前 (表示名の既定値) */
export const baseName = (fileName: string): string => {
  const i = fileName.lastIndexOf(".");
  return i <= 0 ? fileName : fileName.slice(0, i);
};

/** ブラウザでそのまま開けるもの (PDF・画像)。それ以外は保存になる */
export const opensInline = (mimeType: string): boolean =>
  mimeType === "application/pdf" || mimeType.startsWith("image/");

/** 添付しようとしたファイルの種類と大きさを確かめ、保存する MIME を返す */
export function checkMaterialFile(file: { fileName: string; size: number }): Checked<string> {
  const mime = MATERIAL_FILE_TYPES[extOf(file.fileName)];
  if (!mime) {
    return {
      ok: false,
      error: `「${file.fileName}」は添付できません（PDF・Word・Excel・PowerPoint・画像のみ）`,
    };
  }
  if (file.fileName.length > MAX_FILE_NAME) {
    return { ok: false, error: "ファイル名が長すぎます" };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: `「${file.fileName}」は空のファイルです` };
  }
  if (file.size > MAX_MATERIAL_BYTES) {
    return {
      ok: false,
      error: `「${file.fileName}」は大きすぎます（${MAX_MATERIAL_BYTES / 1024 / 1024}MB まで）`,
    };
  }
  return { ok: true, value: mime };
}

/** YouTube の URL なら動画 ID。watch / youtu.be / shorts / embed / live に対応 */
export function youTubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(shorts|embed|live|v)\/([^/]+)/.exec(u.pathname);
      id = m?.[2] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 作成画面の資料一覧を検証する。表示名が空ならファイル名 / 「研修動画」などで埋める。
 * FILE の大きさ・本体の有無はサーバーがストレージで確かめる (ここでは形だけ)。
 */
export function checkMaterials(v: unknown): Checked<SurveyMaterial[]> {
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) return { ok: false, error: "研修資料が読み取れません" };
  if (v.length > MAX_MATERIALS) {
    return { ok: false, error: `研修資料は ${MAX_MATERIALS} 個までです` };
  }
  const out: SurveyMaterial[] = [];
  for (const [i, m] of v.entries()) {
    const n = i + 1;
    if (!isObj(m) || (m.kind !== "FILE" && m.kind !== "LINK")) {
      return { ok: false, error: `研修資料 ${n} が読み取れません` };
    }
    const id = typeof m.id === "string" ? m.id : "";
    const mustView = m.mustView !== false;
    let title = text(m.title);
    if (title.length > MAX_TITLE) {
      return { ok: false, error: `研修資料 ${n} の名前は ${MAX_TITLE} 文字以内にしてください` };
    }

    if (m.kind === "LINK") {
      const url = text(m.url);
      if (url === "") return { ok: false, error: `研修資料 ${n} の URL を入力してください` };
      if (url.length > MAX_URL || !isHttpUrl(url)) {
        return {
          ok: false,
          error: `研修資料 ${n} の URL が正しくありません（https:// から始まる URL を貼ってください）`,
        };
      }
      if (title === "") title = youTubeId(url) ? "研修動画" : "リンク";
      out.push({
        id,
        kind: "LINK",
        title,
        url,
        storageKey: "",
        fileName: "",
        mimeType: "",
        sizeBytes: 0,
        mustView,
      });
      continue;
    }

    const storageKey = text(m.storageKey);
    const fileName = text(m.fileName);
    if (!isMaterialStorageKey(storageKey) || fileName === "") {
      return { ok: false, error: `研修資料 ${n} のファイルが読み取れません` };
    }
    const mime = checkMaterialFile({
      fileName,
      size: typeof m.sizeBytes === "number" ? m.sizeBytes : 0,
    });
    if (!mime.ok) return mime;
    if (title === "") title = baseName(fileName).slice(0, MAX_TITLE);
    out.push({
      id,
      kind: "FILE",
      title,
      url: "",
      storageKey,
      fileName,
      mimeType: mime.value,
      sizeBytes: m.sizeBytes as number,
      mustView,
    });
  }
  return { ok: true, value: out };
}

/** 見ないと回答できない資料のうち、まだ見ていないもの */
export function unviewedMaterials<T extends { id: string; mustView: boolean }>(
  materials: ReadonlyArray<T>,
  viewedIds: ReadonlySet<string>,
): T[] {
  return materials.filter((m) => m.mustView && !viewedIds.has(m.id));
}

const FILE_LABEL: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  png: "画像",
  jpg: "画像",
  jpeg: "画像",
};

/** 「Excel・1.2MB」のような説明 */
export function fileDetail(fileName: string, sizeBytes: number): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return `${FILE_LABEL[ext] ?? "ファイル"}・${formatBytes(sizeBytes)}`;
}

/** 「1.2MB」のような表示 */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
