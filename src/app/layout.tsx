import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kinntai",
  description: "介護事業所向け勤怠管理アプリ",
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
