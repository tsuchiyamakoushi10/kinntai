/** 「使い方」画面に出すマニュアル PDF と操作説明動画の一覧 (catalog.ts は自動生成) */
export type ManualAudience = "admin" | "staff";

export type ManualPdf = {
  audience: ManualAudience;
  title: string;
  /** public/ からのパス */
  href: string;
};

export type ManualVideo = {
  audience: ManualAudience;
  title: string;
  /** public/ からのパス */
  href: string;
  /** 再生前に見せる表紙画像 (public/ からのパス) */
  poster: string;
  durationSec: number;
  width: number;
  height: number;
};

export type ManualCatalog = {
  pdfs: ManualPdf[];
  videos: ManualVideo[];
  /** 動画の音声のクレジット (VOICEVOX の利用規約で表記が必要) */
  voiceCredit: string;
};

/** 動画の長さを「2分10秒」のように出す */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return s === 0 ? `${m}分` : `${m}分${s}秒`;
}
