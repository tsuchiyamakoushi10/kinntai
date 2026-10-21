"use client";

import { useEffect, useRef, useState } from "react";

/** 職員の画面に渡す研修資料 (ストレージのキーは渡さない) */
export type AnswerMaterial = {
  id: string;
  kind: "FILE" | "LINK";
  title: string;
  /** FILE: 「PDF・1.2MB」など */
  detail: string;
  /** YouTube なら動画 ID (画面の中で再生する) */
  youTubeId: string | null;
  mustView: boolean;
};

type Props = {
  materials: ReadonlyArray<AnswerMaterial>;
  viewed: ReadonlySet<string>;
  onViewed: (id: string) => void;
};

/** S-E-12 の上に出す研修資料。docs/training-survey.md §2.2 */
export function MaterialsPanel({ materials, viewed, onViewed }: Props) {
  if (materials.length === 0) return null;
  const must = materials.filter((m) => m.mustView);
  const mustDone = must.filter((m) => viewed.has(m.id)).length;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="materials-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="materials-heading" className="text-lg font-bold text-slate-900">
          研修資料
        </h2>
        {must.length > 0 && (
          <p
            className={`text-sm font-semibold ${mustDone === must.length ? "text-emerald-700" : "text-amber-700"}`}
          >
            {mustDone === must.length ? "すべて見ました" : `${mustDone} / ${must.length} 見ました`}
          </p>
        )}
      </div>
      {must.length > 0 && mustDone < must.length && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          「必ず見る」の資料をすべて見ると、下のアンケートを送信できます。
        </p>
      )}
      {materials.map((m) => (
        <MaterialCard key={m.id} m={m} done={viewed.has(m.id)} onViewed={() => onViewed(m.id)} />
      ))}
    </section>
  );
}

function MaterialCard({
  m,
  done,
  onViewed,
}: {
  m: AnswerMaterial;
  done: boolean;
  onViewed: () => void;
}) {
  const href = `/api/training-materials/${m.id}/open`;
  const badge = done ? (
    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-800">
      ✓ 見た
    </span>
  ) : m.mustView ? (
    <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-sm font-bold text-rose-700">
      必ず見る
    </span>
  ) : null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ${done ? "ring-2 ring-emerald-300" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold break-words text-slate-900">
            <span aria-hidden className="mr-1">
              {m.youTubeId ? "▶" : m.kind === "FILE" ? "📄" : "🔗"}
            </span>
            {m.title}
          </p>
          {m.detail && <p className="text-sm text-slate-500">{m.detail}</p>}
        </div>
        {badge}
      </div>
      {m.youTubeId ? (
        <>
          <YouTubePlayer videoId={m.youTubeId} onEnded={onViewed} fallbackHref={href} />
          {!done && (
            <p className="text-sm text-slate-600">最後まで再生すると「✓ 見た」になります。</p>
          )}
        </>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onViewed}
          className="rounded-xl bg-sky-600 py-3 text-center text-base font-bold text-white hover:bg-sky-700"
        >
          {m.kind === "FILE" ? "開く" : "リンクを開く"}
        </a>
      )}
    </div>
  );
}

// --- YouTube IFrame Player API (最後まで再生したかを知るため) ---

type YTPlayer = { destroy: () => void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number>;
      events?: { onStateChange?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState.ENDED */
const YT_ENDED = 0;
let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("youtube api load failed"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

function YouTubePlayer({
  videoId,
  onEnded,
  fallbackHref,
}: {
  videoId: string;
  onEnded: () => void;
  fallbackHref: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    // YT.Player は渡した要素を iframe に置き換えるので、React が持たない要素を作って渡す
    const target = document.createElement("div");
    box.appendChild(target);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onStateChange: (e) => {
              if (e.data === YT_ENDED) endedRef.current();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      player?.destroy();
      box.replaceChildren();
    };
  }, [videoId]);

  if (failed) {
    return (
      <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
        動画を読み込めませんでした。通信のよい場所で開き直してください。
        <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="ml-1 underline">
          YouTube で開く
        </a>
      </p>
    );
  }
  return <div ref={boxRef} className="aspect-video w-full overflow-hidden rounded-xl bg-black" />;
}
