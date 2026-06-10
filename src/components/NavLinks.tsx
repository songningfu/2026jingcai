"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/matches", label: "赛程" },
  { href: "/calculator", label: "赔率工具" },
  { href: "/games", label: "积分竞猜" },
  { href: "/pricing", label: "订阅" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href) ||
              (item.href === "/matches" && pathname.startsWith("/match/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3.5 py-1.5 transition ${
              active
                ? "bg-neon/10 font-medium text-neon"
                : "text-mut hover:bg-raised hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
