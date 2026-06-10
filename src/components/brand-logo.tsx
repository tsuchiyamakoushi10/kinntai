import Image from "next/image";

import { APP_NAME_MAIN, APP_NAME_SUB } from "@/lib/brand";

import brandMark from "./brand-mark.jpg";

type Size = "md" | "lg";

const MARK: Record<Size, string> = { md: "size-10", lg: "size-16" };
const MAIN: Record<Size, string> = { md: "text-lg", lg: "text-2xl" };
const SUB: Record<Size, string> = { md: "text-[11px]", lg: "text-sm" };

/**
 * システム名ロゴ (ロゴマーク + CrossShift + 結いの心)。ヘッダー(md) とログイン(lg) で使う。
 * 純粋な表示コンポーネント (hooks なし) なのでサーバ/クライアント両方で使える。
 */
export function BrandLogo({ size = "md" }: { size?: Size }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src={brandMark}
        alt={`${APP_NAME_MAIN} ロゴ`}
        priority
        className={`${MARK[size]} object-contain`}
      />
      <span className="flex flex-col leading-tight">
        <span className={`font-extrabold tracking-tight text-slate-900 ${MAIN[size]}`}>
          {APP_NAME_MAIN}
        </span>
        <span className={`font-medium tracking-wide text-slate-500 ${SUB[size]}`}>
          {APP_NAME_SUB}
        </span>
      </span>
    </div>
  );
}
