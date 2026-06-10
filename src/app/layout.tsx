import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DISCLAIMER } from "@/lib/odds";

export const metadata: Metadata = {
  title: {
    default: "球译 — 世界杯数据资讯",
    template: "%s | 球译",
  },
  description:
    "用 AI 和数据帮球迷看懂世界杯每一场球的资讯工具站。赛程数据、AI 赛事报告、概率换算工具。本站为信息工具，不提供投注。",
};

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/matches", label: "赛程" },
  { href: "/calculator", label: "概率工具" },
  { href: "/games", label: "积分竞猜" },
  { href: "/pricing", label: "订阅" },
] as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-emerald-900/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-emerald-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-sm text-white">
                译
              </span>
              球译
            </Link>
            <nav className="flex gap-1 overflow-x-auto text-sm">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-neutral-600 transition hover:bg-emerald-50 hover:text-emerald-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        {/* 第 7 章：全局页脚固定合规提示，所有页面可见，不得移除 */}
        <footer className="border-t border-emerald-900/10 bg-white">
          <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-xs leading-relaxed text-neutral-500">
            <p className="font-medium text-neutral-600">
              本站为体育数据资讯与工具平台，仅提供信息整理与数据分析，
              <strong>不提供任何投注、代购、代投服务，不设任何购彩入口</strong>。
            </p>
            <p>{DISCLAIMER}</p>
            <p>
              所有分析内容不构成购彩建议；本站不对任何数据的准确性、完整性作出承诺。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
