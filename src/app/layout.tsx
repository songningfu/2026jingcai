import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import BottomNav from "@/components/BottomNav";
import MobileMenu from "@/components/MobileMenu";
import DisclaimerButton from "@/components/DisclaimerButton";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AnnouncementBell from "@/components/AnnouncementBell";
import { DISCLAIMER } from "@/lib/odds";
import { AuthProvider } from "@/lib/auth-context";

const barlow = localFont({
  src: [
    { path: "../../public/fonts/barlow-500-v.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/barlow-500-e.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/barlow-500.woff2",   weight: "500", style: "normal" },
    { path: "../../public/fonts/barlow-600-v.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/barlow-600-e.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/barlow-600.woff2",   weight: "600", style: "normal" },
    { path: "../../public/fonts/barlow-700-v.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/barlow-700-e.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/barlow-700.woff2",   weight: "700", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
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
        <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-13 max-w-5xl items-center gap-5 px-4 sm:h-14">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-ink">
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-neon/15 text-sm text-neon ring-1 ring-neon/40">
                译
              </span>
              <span className="text-base font-bold text-ink">球译</span>
              <span className="font-num mt-0.5 hidden text-xs font-semibold tracking-widest text-faint sm:block">
                WC2026
              </span>
            </Link>
            <div className="hidden sm:block">
              <NavLinks />
            </div>
            {/* 右上角：手机端 */}
            <div className="ml-auto flex items-center gap-1 sm:hidden">
              <AnnouncementBell />
              <DisclaimerButton />
              <MobileMenu />
            </div>
            {/* 桌面端右侧：喇叭公告图标 */}
            <div className="ml-auto hidden sm:flex items-center gap-2">
              <AnnouncementBell />
            </div>
          </div>
        </header>

        <AnnouncementBanner />
        <AuthProvider>
          <main className="flex-1 pb-16 sm:pb-0">{children}</main>
          <BottomNav />
        </AuthProvider>

        {/* 合规页脚 —— 桌面详细，手机紧凑，不得移除 */}
        <footer className="border-t border-line bg-surface">
          {/* 桌面端：完整版 */}
          <div className="hidden sm:block mx-auto max-w-5xl px-4 py-6">
            <p className="text-xs font-medium text-mut">
              本站为体育数据资讯与工具平台，仅提供信息整理与数据分析，
              <span className="font-semibold text-ink">不提供任何投注、代购、代投服务，不设任何购彩入口。</span>
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              {DISCLAIMER}
              <span className="mx-2 text-line">·</span>
              所有分析内容不构成购彩建议；本站不对任何数据的准确性、完整性作出承诺。
            </p>
          </div>
          {/* 手机端：单行紧凑合规提示，在底部导航上方 */}
          <div className="sm:hidden px-4 py-3 mb-[calc(env(safe-area-inset-bottom)+56px)]">
            <p className="text-[10px] leading-relaxed text-faint text-center">
              本站为数据资讯工具 · 不提供投注服务 · 分析内容不构成购彩建议
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
