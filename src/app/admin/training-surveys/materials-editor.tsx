"use client";

import { useRef, useState } from "react";

import {
  checkMaterialFile,
  fileDetail,
  MATERIAL_FILE_ACCEPT,
  MAX_MATERIALS,
  type SurveyMaterial,
  youTubeId,
} from "@/lib/training-survey/materials";

import { prepareMaterialUpload } from "./actions";

/** 画面上の資料。アップロード中のものは progress を持つ */
export type EditableMaterial = SurveyMaterial & {
  key: string;
  /** 0〜100。null ならアップロード済み */
  progress: number | null;
};

type Props = {
  materials: EditableMaterial[];
  setMaterials: React.Dispatch<React.SetStateAction<EditableMaterial[]>>;
  /** 回答画面の資料を開く (保存済みの資料だけ) */
  canOpenSaved: boolean;
};

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-base";
const subBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

let keySeq = 0;
export const newMaterialKey = () => `m${(keySeq += 1)}`;

/** ブラウザから署名つき URL へ直接送る (進み具合を出すため XHR) */
function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/** S-A-36 の「研修資料」欄。docs/training-survey.md §2.2 */
export function MaterialsEditor({ materials, setMaterials, canOpenSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const full = materials.length >= MAX_MATERIALS;

  const patch = (key: string, p: Partial<EditableMaterial>) =>
    setMaterials((prev) => prev.map((m) => (m.key === key ? { ...m, ...p } : m)));
  const remove = (key: string) => setMaterials((prev) => prev.filter((m) => m.key !== key));
  const move = (i: number, to: number) =>
    setMaterials((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(to, 0, item!);
      return next;
    });

  async function addFiles(files: FileList) {
    setError(null);
    const list = [...files].slice(0, MAX_MATERIALS - materials.length);
    for (const file of list) {
      const checked = checkMaterialFile({ fileName: file.name, size: file.size });
      if (!checked.ok) {
        setError(checked.error);
        continue;
      }
      const key = newMaterialKey();
      setMaterials((prev) => [
        ...prev,
        {
          key,
          id: "",
          kind: "FILE",
          title: file.name.replace(/\.[^.]+$/, ""),
          url: "",
          storageKey: "",
          fileName: file.name,
          mimeType: checked.value,
          sizeBytes: file.size,
          mustView: true,
          progress: 0,
        },
      ]);
      const prep = await prepareMaterialUpload(file.name, file.size);
      if (!prep.ok) {
        setError(prep.error);
        remove(key);
        continue;
      }
      try {
        await putFile(prep.upload.url, prep.upload.headers, file, (pct) =>
          patch(key, { progress: pct }),
        );
        patch(key, { storageKey: prep.storageKey, mimeType: prep.mimeType, progress: null });
      } catch {
        setError(`「${file.name}」を送れませんでした。通信のよい場所でもう一度添付してください`);
        remove(key);
      }
    }
  }

  function addLink() {
    setMaterials((prev) => [
      ...prev,
      {
        key: newMaterialKey(),
        id: "",
        kind: "LINK",
        title: "",
        url: "",
        storageKey: "",
        fileName: "",
        mimeType: "",
        sizeBytes: 0,
        mustView: true,
        progress: null,
      },
    ]);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">研修資料（任意）</h2>
        <p className="text-xs text-slate-500">
          PDF・Word・Excel・PowerPoint・画像（1 ファイル 20MB まで）と、YouTube
          などのリンクを付けられます。 動画は YouTube に「限定公開」で上げて、その URL
          を貼ってください。
        </p>
      </div>

      {materials.map((m, i) => {
        const yt = m.kind === "LINK" ? youTubeId(m.url) : null;
        return (
          <div key={m.key} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {m.kind === "FILE" ? "ファイル" : yt ? "YouTube" : "リンク"}
              </span>
              {m.kind === "FILE" && (
                <span className="min-w-0 truncate text-sm text-slate-600">
                  {m.fileName}（{fileDetail(m.fileName, m.sizeBytes)}）
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  aria-label="上へ"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className={`${subBtn} px-2 py-1`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="下へ"
                  onClick={() => move(i, i + 1)}
                  disabled={i === materials.length - 1}
                  className={`${subBtn} px-2 py-1`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(m.key)}
                  className={`${subBtn} px-2 py-1 text-red-700`}
                >
                  削除
                </button>
              </div>
            </div>

            {m.progress !== null ? (
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-sky-600" style={{ width: `${m.progress}%` }} />
                </div>
                <span className="text-xs text-slate-600">アップロード中 {m.progress}%</span>
              </div>
            ) : null}

            {m.kind === "LINK" && (
              <input
                value={m.url}
                onChange={(e) => patch(m.key, { url: e.target.value })}
                placeholder="https://youtu.be/…"
                inputMode="url"
                aria-label="URL"
                className={inputCls}
              />
            )}
            <input
              value={m.title}
              onChange={(e) => patch(m.key, { title: e.target.value })}
              placeholder={m.kind === "FILE" ? "表示名" : "表示名（例: 感染症対策 前編）"}
              aria-label="表示名"
              maxLength={100}
              className={inputCls}
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={m.mustView}
                  onChange={(e) => patch(m.key, { mustView: e.target.checked })}
                  className="size-5"
                />
                見ないと回答できない
              </label>
              {m.mustView && (
                <span className="text-xs text-slate-500">
                  {yt
                    ? "動画を最後まで再生すると「見た」になります"
                    : "職員が開くと「見た」になります"}
                </span>
              )}
              {canOpenSaved && m.id !== "" && (
                <a
                  href={`/api/training-materials/${m.id}/open`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm text-sky-700 underline"
                >
                  開いて確かめる
                </a>
              )}
            </div>
          </div>
        );
      })}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={MATERIAL_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={full}
          onClick={() => fileRef.current?.click()}
          className={subBtn}
        >
          ＋ ファイルを添付
        </button>
        <button type="button" disabled={full} onClick={addLink} className={subBtn}>
          ＋ 動画・リンクを追加
        </button>
      </div>
    </section>
  );
}
