"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU_ITEMS = [
  { href: "/matches",   label: "赛程"   },
  { href: "/news",      label: "快讯"   },
  { href: "/games",     label: "积分竞猜" },
  { href: "/pricing",   label: "订阅"   },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-mut transition-colors active:bg-raised"
        aria-label="更多菜单"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-line bg-white shadow-xl shadow-ink/8 py-1 z-50">
          {MENU_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-2.5 text-sm transition-colors active:bg-raised/60 ${
                  active ? "text-neon font-semibold" : "text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
