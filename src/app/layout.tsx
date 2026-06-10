import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import { DISCLAIMER } from "@/lib/odds";

const barlow = Barlow_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: {
    default: "球译 — 世界杯数据资讯",
    template: "%s | 球译",
  },
  description:
    "用 AI 和数据帮球迷看懂世界杯每一场球的资讯工具站。赛程数据、AI 赛事报告、官方赔率换算工具。本站为信息工具，不提供投注。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${barlow.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-pitch/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-5 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-ink">
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-neon/15 text-sm text-neon ring-1 ring-neon/40">
                译
              </span>
              球译
              <span className="font-num mt-0.5 hidden text-xs font-semibold tracking-widest text-faint sm:block">
                WC2026
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        {/* 第 7 章：全局页脚固定合规提示，所有页面可见，不得移除 */}
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-xs leading-relaxed text-faint">
            <p className="text-mut">
              本站为体育数据资讯与工具平台，仅提供信息整理与数据分析，
              <strong className="text-mut">
                不提供任何投注、代购、代投服务，不设任何购彩入口
              </strong>
              。
            </p>
            <p>{DISCLAIMER}</p>
            <p>所有分析内容不构成购彩建议；本站不对任何数据的准确性、完整性作出承诺。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
