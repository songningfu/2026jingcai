"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface RecentUser {
  id: string;
  nickname: string | null;
  email: string | null;
  sub_tier: string | null;
  sub_expires: string | null;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  activeSubs: number;
  totalCodes: number;
  usedCodes: number;
  totalPoints: number;
  totalPredictions: number;
  totalUnlocks: number;
  recentUsers: RecentUser[];
}

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub?: string; accent?: "neon" | "amber" | "live";
}) {
  const colors = { neon: "text-neon", amber: "text-amber", live: "text-live" };
  return (
    <div className="card p-4">
      <p className="text-[11px] text-faint">{label}</p>
      <p className={`font-num mt-1 text-2xl font-bold tabular-nums ${accent ? colors[accent] : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

function Dashboard() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/stats?secret=${secret}`)
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [secret]);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isSubActive = (u: RecentUser) => !!u.sub_expires && new Date(u.sub_expires) > new Date();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* 页头 */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">总览</h1>
          <p className="mt-0.5 text-xs text-faint">
            {new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-mut hover:text-ink disabled:opacity-40 transition">
          {loading ? "加载中…" : "↺ 刷新"}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20 animate-pulse" />)}
        </div>
      ) : !stats ? (
        <p className="text-sm text-live">加载失败，请刷新</p>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
            <StatCard label="注册用户" value={stats.totalUsers} />
            <StatCard label="有效订阅" value={stats.activeSubs}
              sub={`占比 ${stats.totalUsers ? Math.round(stats.activeSubs / stats.totalUsers * 100) : 0}%`}
              accent={stats.activeSubs > 0 ? "neon" : undefined} />
            <StatCard label="激活码使用" value={`${stats.usedCodes} / ${stats.totalCodes}`}
              sub="已用 / 总量" />
            <StatCard label="剩余可用码" value={stats.totalCodes - stats.usedCodes}
              accent={(stats.totalCodes - stats.usedCodes) === 0 ? "live" : undefined} />
            <StatCard label="积分总量" value={stats.totalPoints.toLocaleString()}
              sub={`人均 ${stats.totalUsers ? Math.round(stats.totalPoints / stats.totalUsers).toLocaleString() : 0}`} />
            <StatCard label="竞猜次数" value={stats.totalPredictions} />
            <StatCard label="推演解锁" value={stats.totalUnlocks} />
          </div>

          {/* 下半区：快捷入口 + 近期用户 */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* 近期注册 */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-semibold text-ink">近期注册</p>
                <Link href={`/admin/users?secret=${secret}`}
                  className="text-[11px] text-neon hover:underline">
                  全部 →
                </Link>
              </div>
              {stats.recentUsers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-faint">暂无用户</p>
              ) : (
                <ul className="divide-y divide-line">
                  {stats.recentUsers.map(u => (
                    <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-mut">
                        {(u.nickname ?? u.email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink truncate">{u.nickname ?? "未设置"}</p>
                        <p className="text-[10px] text-faint truncate">{u.email ?? u.id.slice(0, 12)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {isSubActive(u) ? (
                          <span className={`chip !text-[9px] ${u.sub_tier === "max" ? "!text-amber" : "!text-neon"}`}>
                            {(u.sub_tier ?? "").toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-[10px] text-faint">免费</span>
                        )}
                        <p className="mt-0.5 text-[9px] text-faint">{fmtDate(u.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 快捷操作 */}
            <div className="space-y-3">
              <Link href={`/admin/codes?secret=${secret}`}
                className="card flex items-center gap-4 p-4 transition hover:border-neon/40">
                <span className="text-2xl opacity-60">◈</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">激活码管理</p>
                  <p className="text-xs text-faint">生成、查看、作废激活码</p>
                </div>
                <span className="text-xs text-neon">→</span>
              </Link>
              <Link href={`/admin/users?secret=${secret}`}
                className="card flex items-center gap-4 p-4 transition hover:border-neon/40">
                <span className="text-2xl opacity-60">◉</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">用户管理</p>
                  <p className="text-xs text-faint">查看用户、改订阅、调积分</p>
                </div>
                <span className="text-xs text-neon">→</span>
              </Link>
              <Link href={`/admin/data?secret=${secret}`}
                className="card flex items-center gap-4 p-4 transition hover:border-live/30">
                <span className="text-2xl opacity-60">⚙</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">数据管理</p>
                  <p className="text-xs text-faint">清零测试数据、重置用户</p>
                </div>
                <span className="text-xs text-live">→</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense><Dashboard /></Suspense>;
}
