"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/admin/dashboard",  label: "总览",    icon: "⬡" },
  { href: "/admin/analytics",  label: "数据分析", icon: "▦" },
  { href: "/admin/announcements",  label: "通知公告", icon: "📢" },
  { href: "/admin/codes",      label: "激活码",  icon: "◈" },
  { href: "/admin/users",      label: "用户",    icon: "◉" },
  { href: "/admin/data",       label: "数据管理", icon: "⚙" },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 路由切换时关闭抽屉
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {NAV.map(n => {
        const active = pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={`${n.href}?secret=${secret}`}
            onClick={onClick}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-neon/10 text-neon font-semibold"
                : "text-mut hover:bg-raised hover:text-ink"
            }`}>
            <span className="w-4 text-center text-base opacity-60">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-pitch overflow-hidden md:flex-row">

      {/* ── 移动端顶栏 ── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <div className="flex items-center gap-2">
          <p className="text-[9px] tracking-[0.3em] font-semibold text-neon">ADMIN</p>
          <p className="text-sm font-bold text-ink">球译后台</p>
        </div>
        <button onClick={() => setDrawerOpen(o => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mut hover:bg-raised hover:text-ink transition-colors"
          aria-label="菜单">
          {drawerOpen ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
              <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
              <rect x="2" y="3.5" width="12" height="1.5" rx="0.75"/>
              <rect x="2" y="7.25" width="12" height="1.5" rx="0.75"/>
              <rect x="2" y="11" width="12" height="1.5" rx="0.75"/>
            </svg>
          )}
        </button>
      </header>

      {/* ── 移动端抽屉遮罩 ── */}
      {drawerOpen && (
        <div className="fixed inset-0 top-12 z-10 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── 移动端抽屉 / 桌面侧边栏 ── */}
      <aside className={`
        fixed top-12 left-0 bottom-0 z-20 w-56 flex flex-col border-r border-line bg-surface
        transition-transform duration-200
        ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
        md:static md:top-auto md:w-48 md:translate-x-0 md:shrink-0
      `}>
        {/* 桌面端品牌区 */}
        <div className="hidden px-5 pt-6 pb-5 border-b border-line md:block">
          <p className="text-[9px] tracking-[0.35em] font-semibold text-neon">ADMIN</p>
          <p className="mt-1 text-base font-bold text-ink leading-tight">球译后台</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
          <NavLinks onClick={() => setDrawerOpen(false)} />
        </nav>

        <div className="border-t border-line px-4 py-4 space-y-1.5">
          <Link href="/" target="_blank"
            className="block text-xs text-faint hover:text-mut transition-colors">
            ↗ 访问主站
          </Link>
          <p className="text-[10px] text-faint/40">仅限授权人员访问</p>
        </div>
      </aside>

      {/* ── 主内容区 ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>

    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
