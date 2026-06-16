"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Target = "guest_profiles" | "predictions" | "points_ledger" | "unlocks" | "profiles" | "activation_codes";

const ITEMS: { key: Target; label: string; desc: string; danger: "high" | "medium" }[] = [
  {
    key: "guest_profiles",
    label: "清理历史访客",
    desc: "删除无邮箱、无积分的遗留设备 ID 记录（登录制上线前的游客数据）",
    danger: "medium",
  },
  {
    key: "predictions",
    label: "竞猜记录",
    desc: "清空所有用户的竞猜投注数据（predictions 表）",
    danger: "medium",
  },
  {
    key: "points_ledger",
    label: "积分流水",
    desc: "清空积分变动日志（points_ledger 表）",
    danger: "medium",
  },
  {
    key: "unlocks",
    label: "推演解锁",
    desc: "清空所有付费解锁记录（unlocks 表）",
    danger: "medium",
  },
  {
    key: "profiles",
    label: "重置用户数据",
    desc: "将所有用户积分清零、订阅状态清空（保留账号本身）",
    danger: "high",
  },
  {
    key: "activation_codes",
    label: "激活码",
    desc: "删除所有激活码记录（含已用和未用）",
    danger: "high",
  },
];

function DataPanel() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [selected, setSelected] = useState<Set<Target>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; results: Record<string, { ok: boolean; count?: number; error?: string }> } | null>(null);

  const toggle = (key: Target) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setResult(null);
    setConfirm(false);
  };

  const doReset = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/reset?secret=${secret}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: Array.from(selected) }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        setSelected(new Set());
        setConfirm(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const hasHigh = Array.from(selected).some(k => ITEMS.find(i => i.key === k)?.danger === "high");

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-ink">数据管理</h1>
        <p className="mt-1 text-xs text-faint">选择需要清零的数据类型，操作不可恢复，请谨慎</p>
      </div>

      {/* 警告提示 */}
      <div className="mb-6 rounded-xl border border-live/30 bg-live/5 px-4 py-3 text-xs text-live">
        ⚠ 所有清零操作均直接修改生产数据库，无法撤销。建议操作前在 Supabase 控制台备份。
      </div>

      {/* 选项列表 */}
      <div className="space-y-2 mb-6">
        {ITEMS.map(item => {
          const checked = selected.has(item.key);
          return (
            <button key={item.key} onClick={() => toggle(item.key)}
              className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                checked
                  ? item.danger === "high"
                    ? "border-live/50 bg-live/8"
                    : "border-amber/40 bg-amber/5"
                  : "border-line hover:border-line/80 hover:bg-raised/40"
              }`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  checked
                    ? item.danger === "high" ? "border-live bg-live" : "border-amber bg-amber"
                    : "border-line bg-surface"
                }`}>
                  {checked && <span className="text-[10px] font-bold text-white">✓</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{item.label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      item.danger === "high" ? "bg-live/10 text-live" : "bg-amber/10 text-amber"
                    }`}>
                      {item.danger === "high" ? "高风险" : "中风险"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-faint">{item.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 操作区 */}
      {selected.size > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-3 text-xs text-mut">
            已选择 <span className="font-semibold text-ink">{selected.size}</span> 项：
            {Array.from(selected).map(k => ITEMS.find(i => i.key === k)?.label).join("、")}
          </p>

          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="w-full rounded-lg border border-live/50 py-2.5 text-sm font-semibold text-live transition hover:bg-live/10">
              确认执行清零
            </button>
          ) : (
            <div className="space-y-2">
              {hasHigh && (
                <p className="rounded-lg bg-live/10 px-3 py-2 text-xs font-semibold text-live">
                  ⚠ 包含高风险操作，执行后数据无法恢复！
                </p>
              )}
              <p className="text-center text-xs text-mut">再次点击确认执行</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirm(false)}
                  className="flex-1 rounded-lg border border-line py-2 text-sm text-mut hover:text-ink">
                  取消
                </button>
                <button onClick={doReset} disabled={loading}
                  className="flex-1 rounded-lg bg-live py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50">
                  {loading ? "执行中…" : "执行清零"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 执行结果 */}
      {result && (
        <div className={`mt-4 rounded-xl border p-4 ${result.ok ? "border-neon/30 bg-neon/5" : "border-live/30 bg-live/5"}`}>
          <p className={`mb-2 text-sm font-semibold ${result.ok ? "text-neon" : "text-live"}`}>
            {result.ok ? "✓ 全部执行成功" : "部分执行失败"}
          </p>
          <ul className="space-y-1">
            {Object.entries(result.results).map(([key, r]) => {
              const label = ITEMS.find(i => i.key === key)?.label ?? key;
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  <span className={r.ok ? "text-neon" : "text-live"}>{r.ok ? "✓" : "✗"}</span>
                  <span className="text-ink">{label}</span>
                  {r.ok
                    ? <span className="text-faint">— 已处理 {r.count ?? 0} 条</span>
                    : <span className="text-live">{r.error}</span>
                  }
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DataPage() {
  return <Suspense><DataPanel /></Suspense>;
}
