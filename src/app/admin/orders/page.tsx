"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Order {
  id: string;
  email: string;
  plan: string;
  amount: number;
  pay_note: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
}

type Filter = "all" | "pending" | "approved" | "rejected";

function OrdersPanel() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [processing, setProcessing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/orders?secret=${secret}`)
      .then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [secret]);

  const approve = async (orderId: string) => {
    setProcessing(orderId);
    const res = await fetch(`/api/admin/approve?secret=${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    setResults(r => ({
      ...r,
      [orderId]: {
        ok: data.ok,
        msg: data.ok
          ? `已激活至 ${new Date(data.subExpires).toLocaleDateString("zh-CN")}`
          : (data.message ?? "操作失败"),
      },
    }));
    setProcessing(null);
    if (data.ok) load();
  };

  const reject = async (orderId: string) => {
    if (!confirm("确定拒绝此订单？此操作不可恢复。")) return;
    setProcessing(orderId);
    const res = await fetch(`/api/admin/orders?secret=${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", orderId }),
    });
    const data = await res.json();
    setResults(r => ({
      ...r,
      [orderId]: { ok: data.ok, msg: data.ok ? "已拒绝" : (data.message ?? "操作失败") },
    }));
    setProcessing(null);
    if (data.ok) load();
  };

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    approved: orders.filter(o => o.status === "approved").length,
    rejected: orders.filter(o => o.status === "rejected").length,
  };
  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const FILTERS: [Filter, string][] = [
    ["pending", "待审核"],
    ["approved", "已通过"],
    ["rejected", "已拒绝"],
    ["all", "全部"],
  ];

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* 页头 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">订单管理</h1>
          <p className="mt-0.5 text-xs text-faint">共 {orders.length} 笔订单</p>
        </div>
        <button onClick={load} disabled={loading}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-mut hover:text-ink disabled:opacity-40 transition">
          {loading ? "加载中…" : "↺ 刷新"}
        </button>
      </div>

      {/* 筛选 tabs */}
      <div className="mb-5 flex gap-1 border-b border-line pb-3">
        {FILTERS.map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`relative rounded-lg px-3 py-1.5 text-xs transition ${
              filter === f ? "bg-neon/10 font-semibold text-neon" : "text-mut hover:text-ink"
            }`}>
            {l}
            {counts[f] > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                f === "pending" ? "bg-amber/15 text-amber" : "bg-raised text-faint"
              }`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 待审提醒 */}
      {counts.pending > 0 && filter !== "pending" && (
        <button onClick={() => setFilter("pending")}
          className="mb-4 w-full rounded-xl border border-amber/30 bg-amber/5 px-4 py-2.5 text-left text-xs text-amber hover:bg-amber/10 transition">
          ⚠ 有 {counts.pending} 笔订单待审核 — 点击查看
        </button>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-3xl mb-2 opacity-20">▤</p>
          <p className="text-sm text-faint">暂无{filter !== "all" ? { pending: "待审核", approved: "已通过", rejected: "已拒绝" }[filter] : ""}订单</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const result = results[o.id];
            const isPending = o.status === "pending";
            const isProc = processing === o.id;

            return (
              <div key={o.id} className={`card p-4 transition ${isPending && !result ? "border-l-2 border-l-amber/50" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 状态行 */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold ${
                        o.status === "pending" ? "text-amber"
                        : o.status === "approved" ? "text-neon"
                        : "text-live"
                      }`}>
                        {o.status === "pending" ? "● 待审核"
                          : o.status === "approved" ? "✓ 已通过"
                          : "✗ 已拒绝"}
                      </span>
                      <span className="chip">{o.plan.toUpperCase()}</span>
                      <span className="font-num font-bold text-ink">¥{o.amount}</span>
                    </div>

                    {/* 用户信息 */}
                    <p className="text-sm text-mut">{o.email}</p>
                    {o.pay_note && (
                      <p className="mt-1.5 rounded-lg bg-raised px-3 py-1.5 text-xs text-ink">
                        付款备注：{o.pay_note}
                      </p>
                    )}

                    {/* 时间 + ID */}
                    <p className="mt-2 text-[10px] text-faint">
                      提交 {fmtDate(o.created_at)}
                      {o.approved_at && ` · 处理 ${fmtDate(o.approved_at)}`}
                      <span className="mx-1.5">·</span>
                      {o.id.slice(0, 16)}…
                    </p>
                  </div>

                  {/* 操作区 */}
                  <div className="shrink-0">
                    {result ? (
                      <span className={`text-xs font-semibold ${result.ok ? "text-neon" : "text-live"}`}>
                        {result.msg}
                      </span>
                    ) : isPending ? (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={() => approve(o.id)} disabled={isProc}
                          className="rounded-lg bg-neon px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition disabled:opacity-40">
                          {isProc ? "处理中…" : "✓ 通过"}
                        </button>
                        <button onClick={() => reject(o.id)} disabled={isProc}
                          className="rounded-lg border border-live/40 px-3 py-1.5 text-xs font-medium text-live hover:bg-live/5 transition disabled:opacity-40">
                          ✗ 拒绝
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return <Suspense><OrdersPanel /></Suspense>;
}
