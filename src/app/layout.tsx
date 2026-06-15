import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A 股主线投研助手",
  description: "面向 A 股主线、策略选股、个股追踪和风险约束的投研驾驶舱。",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
