"use client";

/**
 * 結いナビの画面の土台。サーバーから受け取ったデータを画面用のメモリに入れてから中身を出す。
 * (メモリはブラウザの中だけで持つ。サーバー側の描画では使わない)
 */
import { useEffect, useState, type ReactNode } from "react";

import type { YuiSnapshot } from "@/lib/yui/types";

import { AuthProvider } from "./auth";
import Layout from "./components/Layout";
import { initYuiStore } from "./storage";

export default function YuiAppShell({
  snapshot,
  homeHref,
  children,
}: {
  snapshot: YuiSnapshot;
  homeHref: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initYuiStore(snapshot);
    setReady(true);
  }, [snapshot]);

  if (!ready) {
    return <div className="yui bg-cream-50 min-h-screen" />;
  }
  return (
    <div className="yui">
      <AuthProvider>
        <Layout homeHref={homeHref}>{children}</Layout>
      </AuthProvider>
    </div>
  );
}
