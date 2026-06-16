"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  nickname: string | null;
  email: string | null;
  points: number;
  sub_type: string | null;
  sub_expires: string | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function UsersPanel() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [actionUser, setActionUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<"grant_sub" | "add_points" | "reset_points">("grant_sub");
  const [subTier, setSubTier] = useState<"pro" | "max">("pro");
  const [subDays, setSubDays] = useState(40);
  const [pointsDelta, setPointsDelta] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = (query = search) => {
    setLoading(true);
    fetch(`/api/admin/users?secret=${secret}${query ? `&q=${encodeURIComponent(query)}` : ""}`)
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [secret]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(q);
    load(q);
  };

  const doAction = async () => {
    if (!actionUser) return;
    setSubmitting(true);
    setActionResult(null);
    const body: Record<string, unknown> = { userId: actionUser.id, action: actionType };
    if (actionType === "grant_sub") { body.tier = subTier; body.days = subDays; }
    if (actionType === "add_points") { body.delta = pointsDelta; }
    const res = await fetch(`/api/admin/users?secret=${secret}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.ok !== false && !data.error) {
      setActionUser(null);
      load();
    } else {
      setActionResult(data.error ?? "操作失败");
    }
  };

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const isSubActive = (u: User) => !!u.sub_expires && new Date(u.sub_expires) > new Date();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/admin/dashboard?secret=${secret}`} className="text-xs text-mut hover:text-ink">← 返回总览</Link>
        <h1 className="text-xl font-bold text-ink">用户管理</h1>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="搜索用户名 / 邮箱 / ID"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-neon/50" />
        <button type="submit"
          className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
          搜索
        </button>
        {search && (
          <button type="button" onClick={() => { setQ(""); setSearch(""); load(""); }}
            className="rounded-lg border border-line px-3 py-2 text-sm text-mut hover:text-ink">
            清除
          </button>
        )}
      </form>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-xs text-faint">{loading ? "加载中…" : `共 ${users.length} 个用户`}</p>
          <button onClick={() => load()} className="text-xs text-mut hover:text-ink">刷新</button>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[...Array(8)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-raised" />)}</div>
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint">暂无数据</p>
        ) : (
          <>
            {/* 桌面端表格 */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-line bg-raised">
                <tr className="text-left text-xs text-faint">
                  <th className="px-4 py-2 font-normal">用户</th>
                  <th className="px-2 py-2 font-normal">邮箱</th>
                  <th className="px-2 py-2 font-normal">积分</th>
                  <th className="px-2 py-2 font-normal">订阅</th>
                  <th className="px-2 py-2 font-normal">注册</th>
                  <th className="px-2 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map(u => (
                  <tr key={u.id} className="transition-colors hover:bg-raised/30">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{u.nickname ?? "未设置"}</p>
                      <p className="text-[10px] text-faint">{u.id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-mut">{u.email ?? "—"}</td>
                    <td className="font-num px-2 py-2.5 text-ink">{(u.points ?? 0).toLocaleString()}</td>
                    <td className="px-2 py-2.5">
                      {isSubActive(u) ? (
                        <div>
                          <span className={`chip !text-[10px] ${u.sub_type === "max" ? "!text-amber" : "!text-neon"}`}>{(u.sub_type ?? "").toUpperCase()}</span>
                          <p className="mt-0.5 text-[10px] text-faint">至 {fmtDate(u.sub_expires!)}</p>
                        </div>
                      ) : <span className="text-xs text-faint">无</span>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-faint">{fmtDate(u.created_at)}</td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => { setActionUser(u); setActionType("grant_sub"); setActionResult(null); }}
                        className="rounded px-2 py-1 text-[11px] text-neon hover:bg-neon/10 transition-colors">
                        操作
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 移动端卡片列表 */}
            <div className="divide-y divide-line md:hidden">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  {/* 头像 */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neon/10 text-sm font-bold text-neon">
                    {(u.nickname ?? u.email ?? "?")[0].toUpperCase()}
                  </div>
                  {/* 信息 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-ink">{u.nickname ?? "未设置"}</p>
                      {isSubActive(u) && (
                        <span className={`shrink-0 rounded px-1 text-[9px] font-bold ${u.sub_type === "max" ? "bg-amber/10 text-amber" : "bg-neon/10 text-neon"}`}>
                          {(u.sub_type ?? "").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-mut">{u.email ?? <span className="text-faint">无邮箱（访客）</span>}</p>
                    <p className="text-[10px] text-faint">{(u.points ?? 0).toLocaleString()} 积分 · {fmtDate(u.created_at)} 注册</p>
                  </div>
                  {/* 操作按钮 */}
                  <button
                    onClick={() => { setActionUser(u); setActionType("grant_sub"); setActionResult(null); }}
                    className="shrink-0 rounded-lg border border-neon/30 px-3 py-1.5 text-xs font-medium text-neon hover:bg-neon/10 transition-colors"
                  >
                    操作
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 操作弹窗 */}
      {actionUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={e => { if (e.target === e.currentTarget) setActionUser(null); }}>
          <div className="card w-full max-w-sm p-6">
            <h3 className="mb-1 font-semibold text-ink">操作用户</h3>
            <p className="mb-4 text-xs text-mut">{actionUser.nickname ?? actionUser.email ?? actionUser.id.slice(0, 12)}</p>

            <div className="mb-4 flex gap-1">
              {([ ["grant_sub", "开通订阅"], ["add_points", "调整积分"], ["reset_points", "清零积分"] ] as const).map(([v, l]) => (
                <button key={v} onClick={() => { setActionType(v); setActionResult(null); }}
                  className={`flex-1 rounded px-2 py-1.5 text-xs transition ${actionType === v ? "bg-neon/10 font-semibold text-neon" : "text-mut hover:text-ink"}`}>
                  {l}
                </button>
              ))}
            </div>

            {actionType === "grant_sub" && (
              <div className="mb-4 flex gap-2">
                <select value={subTier} onChange={e => setSubTier(e.target.value as "pro" | "max")}
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none">
                  <option value="pro">Pro</option>
                  <option value="max">Max</option>
                </select>
                <select value={subDays} onChange={e => setSubDays(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none">
                  <option value={30}>30 天</option>
                  <option value={40}>40 天（全程）</option>
                  <option value={60}>60 天</option>
                  <option value={90}>90 天</option>
                </select>
              </div>
            )}

            {actionType === "add_points" && (
              <div className="mb-4">
                <input type="number" value={pointsDelta} onChange={e => setPointsDelta(Number(e.target.value))}
                  placeholder="正数加积分，负数扣积分"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-neon/50" />
              </div>
            )}

            {actionType === "reset_points" && (
              <p className="mb-4 rounded-lg bg-live/10 px-3 py-2 text-xs text-live">⚠️ 此操作将把该用户积分清零，不可恢复</p>
            )}

            {actionResult && (
              <p className="mb-3 rounded-lg bg-live/10 px-3 py-2 text-xs text-live">{actionResult}</p>
            )}

            <div className="flex gap-2">
              <button onClick={() => setActionUser(null)}
                className="flex-1 rounded-lg border border-line py-2 text-sm text-mut hover:text-ink">
                取消
              </button>
              <button onClick={doAction} disabled={submitting}
                className="flex-1 rounded-lg bg-neon py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                {submitting ? "处理中…" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  return <Suspense><UsersPanel /></Suspense>;
}
