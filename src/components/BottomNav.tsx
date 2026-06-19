"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "首页",
    icon: (a: boolean) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
      </svg>
    ),
  },
  {
    href: "/deduction",
    label: "推演",
    icon: (a: boolean) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/ev",
    label: "EV分析",
    center: true,
    icon: (a: boolean) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    href: "/calculator",
    label: "赔率工具",
    icon: (a: boolean) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <rect x="4" y="2" width="16" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h8M8 10h2m4 0h2M8 14h2m4 0h2M8 18h2m4 0h2"/>
      </svg>
    ),
  },
  {
    href: "/account",
    label: "我的",
    icon: (a: boolean) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="border-t border-line/50 bg-white/95 backdrop-blur-xl">
        <div className="flex h-14 items-stretch">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href) ||
                  (tab.href === "/deduction" && pathname.startsWith("/match/"));

            if ("center" in tab && tab.center) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                    active ? "bg-neon text-white shadow-lg shadow-neon/25" : "bg-neon/10 text-neon"
                  }`}>
                    {tab.icon(active)}
                  </span>
                  <span className={`text-[9px] font-semibold ${active ? "text-neon" : "text-faint"}`}>
                    {tab.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 active:bg-raised/60 transition-colors"
              >
                <span className={`transition-all duration-150 ${active ? "text-neon" : "text-faint"}`}>
                  {tab.icon(active)}
                </span>
                <span className={`text-[9px] font-medium ${active ? "text-neon font-semibold" : "text-faint"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
