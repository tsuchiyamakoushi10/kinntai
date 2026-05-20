"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * <meta http-equiv="refresh"> でも自動遷移はできるが、メタ refresh は
 * フルリロードになるため Next.js の RSC キャッシュが温まり直してしまう。
 * クライアント側のソフト遷移を優先し、保険として meta refresh を併用する。
 */
export function TabletDoneAutoRedirect({ href, delayMs }: { href: string; delayMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace(href), delayMs);
    return () => clearTimeout(id);
  }, [href, delayMs, router]);
  return null;
}
