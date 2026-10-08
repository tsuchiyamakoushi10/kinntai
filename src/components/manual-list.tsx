import { MANUAL_CATALOG } from "@/lib/manual/catalog";
import { formatDuration, type ManualAudience } from "@/lib/manual/types";

const SECTION_TITLES: Record<ManualAudience, string> = {
  admin: "管理者向け",
  staff: "職員向け",
};

/**
 * 「使い方」画面の中身。マニュアル PDF と操作説明動画を、見せる相手ごとに並べる。
 * 動画はページを開いた時点では読み込まず (preload="none")、再生したものだけ通信する。
 */
export function ManualList({ audiences }: { audiences: ManualAudience[] }) {
  return (
    <div className="flex flex-col gap-8">
      {audiences.map((audience) => {
        const pdfs = MANUAL_CATALOG.pdfs.filter((p) => p.audience === audience);
        const videos = MANUAL_CATALOG.videos.filter((v) => v.audience === audience);
        return (
          <section key={audience} className="flex flex-col gap-3">
            {audiences.length > 1 && (
              <h2 className="text-lg font-bold text-slate-900">{SECTION_TITLES[audience]}</h2>
            )}
            {pdfs.map((p) => (
              <a
                key={p.href}
                href={p.href}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-base font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <span>📄 {p.title}（PDF）を開く</span>
                <span aria-hidden className="text-slate-400">
                  →
                </span>
              </a>
            ))}
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {videos.map((v) => (
                <li key={v.href} className="overflow-hidden rounded-2xl bg-slate-800 shadow-sm">
                  <video
                    src={v.href}
                    poster={v.poster}
                    controls
                    preload="none"
                    playsInline
                    width={v.width}
                    height={v.height}
                    style={{ aspectRatio: `${v.width} / ${v.height}` }}
                    className="mx-auto block h-auto max-h-[75vh] w-auto max-w-full bg-slate-800"
                  />
                  <p className="flex items-baseline justify-between gap-3 bg-white px-4 py-3">
                    <span className="text-base font-bold text-slate-900">{v.title}</span>
                    <span className="shrink-0 text-sm text-slate-500">
                      {formatDuration(v.durationSec)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-slate-400">動画の音声：{MANUAL_CATALOG.voiceCredit}</p>
    </div>
  );
}
