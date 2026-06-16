"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ShowcaseItem {
  home: string;
  away: string;
  label: "比分命中" | "胜负命中";
  result: string;
}

const EMPTY: ShowcaseItem = { home: "", away: "", label: "胜负命中", result: "" };

function ShowcasePage() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/admin/showcase?secret=${secret}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items); })
      .finally(() => setLoading(false));
  }, [secret]);

  const update = (i: number, patch: Partial<ShowcaseItem>) => {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  };

  const add = () => setItems((prev) => [...prev, { ...EMPTY }]);

  const remove = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    setMsg("");
    const valid = items.filter((it) => it.home.trim() && it.away.trim() && it.result.trim());
    const res = await fetch(`/api/admin/showcase?secret=${secret}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: valid }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.ok) {
      setItems(d.items);
      setMsg("✓ 保存成功，未登录用户将看到此展示");
    } else {
      setMsg(`✗ 保存失败：${d.error ?? "请先在 Supabase 创建 site_settings 表"}`);
    }
  };

  if (loading) return <div className="p-8 text-sm text-faint">加载中…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-ink">推演预测展示配置</h1>
        <p className="mt-1 text-xs text-faint">
          未登录用户看到的「模型推演预测」板块内容（模糊遮罩下的卡片）。登录用户仍看真实预测数据。
        </p>
      </div>

      {/* 建表提示 */}
      <div className="mb-4 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs text-amber">
        <p className="font-semibold">首次使用需在 Supabase SQL 编辑器运行：</p>
        <pre className="mt-1 overflow-x-auto rounded bg-ink/5 p-2 text-[10px] font-mono leading-relaxed whitespace-pre-wrap">
{`create table if not exists site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);`}
        </pre>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-num text-xs font-bold text-faint">卡片 {i + 1}</span>
              <button onClick={() => remove(i)} className="text-xs text-live hover:underline">删除</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] text-faint">主队名称</span>
                <input
                  value={item.home}
                  onChange={(e) => update(i, { home: e.target.value })}
                  placeholder="如：法国"
                  className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-faint">客队名称</span>
                <input
                  value={item.away}
                  onChange={(e) => update(i, { away: e.target.value })}
                  placeholder="如：摩洛哥"
                  className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-faint">命中类型</span>
                <select
                  value={item.label}
                  onChange={(e) => update(i, { label: e.target.value as ShowcaseItem["label"] })}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                >
                  <option value="胜负命中">胜负命中 ✓</option>
                  <option value="比分命中">比分命中 ✓</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-faint">结果文字</span>
                <input
                  value={item.result}
                  onChange={(e) => update(i, { result: e.target.value })}
                  placeholder={item.label === "比分命中" ? "如：2:0" : "如：法国胜"}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                />
              </label>
            </div>
          </div>
        ))}

        {items.length < 6 && (
          <button
            onClick={add}
            className="w-full rounded-lg border border-dashed border-line py-3 text-xs text-mut hover:border-neon/40 hover:text-neon transition"
          >
            + 添加卡片（最多 6 张）
          </button>
        )}
      </div>

      {/* 预览 */}
      {items.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold text-faint">预览效果（未登录用户看到的模糊卡片）</p>
          <div className="pointer-events-none grid gap-3 sm:grid-cols-2 blur-sm select-none">
            {items.slice(0, 4).map((item, i) => (
              <div key={i} className="card overflow-hidden opacity-80">
                <div className="h-1 w-full bg-gradient-to-r from-neon via-neon/60 to-amber/40" />
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] text-faint">
                    <span>世界杯</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${item.label === "比分命中" ? "bg-amber/10 text-amber" : "bg-neon/10 text-neon"}`}>
                      {item.label} ✓
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 text-right text-sm font-bold text-ink">{item.home || "主队"}</span>
                    <span className="font-num min-w-[52px] text-center text-xl font-bold text-neon">
                      {item.result || "?"}
                    </span>
                    <span className="flex-1 text-left text-sm font-bold text-ink">{item.away || "客队"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-neon px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "保存中…" : "保存配置"}
        </button>
        {msg && (
          <span className={`text-xs ${msg.startsWith("✓") ? "text-neon" : "text-live"}`}>{msg}</span>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><ShowcasePage /></Suspense>;
}
