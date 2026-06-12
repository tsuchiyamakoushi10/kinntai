import type { Metadata, Viewport } from "next";

import { APP_NAME, APP_NAME_MAIN, APP_TAGLINE } from "@/lib/brand";

import "./globals.css";

// ブランドのアクセント色 (ピンク)。manifest と合わせ、ホーム追加時のテーマ色に使う。
const BRAND_THEME_COLOR = "#DC7DA8";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  manifest: "/manifest.json",
  // iOS でホーム画面に追加したときの挙動 (全画面 PWA 風 + アイコン下の名前)。
  appleWebApp: {
    capable: true,
    title: APP_NAME_MAIN,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    // iOS は manifest より apple-touch-icon を優先するため必須 (180x180)。
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icons/favicon.ico"],
  },
};

// themeColor は metadata ではなく viewport に置く (Next.js の警告回避)。
export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
