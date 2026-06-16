"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Announcement {
  id: string;
  content: string;
  type: "info" | "warning" | "important";
  showIn: "both" | "banner" | "bell";
  link?: string;
  linkText?: string;
  active: boolean;
}

const TYPE_LABEL: Record<Announcement["type"], string> = {
  info: "普通通知",
  warning: "警告",
  important: "重要公告",
};

const TYPE_COLOR: Record<Announcement["type"], string> = {
  info: "border-neon/30 bg-neon/5 text-neon",
  warning: "border-amber/30 bg-amber/5 text-amber",
  important: "border-live/30 bg-live/5 text-live",
};

const TYPE_BADGE: Record<Announcement["type"], string> = {
  info: "bg-neon/10 text-neon",
  warning: "bg-amber/10 text-amber",
  important: "bg-live/10 text-live",
};

const SHOW_IN_LABEL: Record<Announcement["showIn"], string> = {
  both:   "顶部横幅 + 喇叭",
  banner: "仅顶部横幅",
  bell:   "仅喇叭图标",
};

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 保留换行渲染
function ContentLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i}>
          {line}
          {i < text.split("\n").length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function AnnouncementsAdmin() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/announcements?secret=${secret}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items); })
      .finally(() => setLoading(false));
  }, [secret]);

  const save = async (next: Announcement[]) => {
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/admin/announcements?secret=${secret}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.ok) {
      setItems(d.items);
      setMsg("✓ 已保存");
      setTimeout(() => setMsg(""), 2000);
    } else {
      setMsg(`✗ ${d.error ?? "保存失败"}`);
    }
  };

  const add = () => {
    const id = newId();
    const blank: Announcement = { id, content: "", type: "info", showIn: "both", active: true };
    setItems((prev) => [blank, ...prev]);
    setEditing(id);
  };

  const update = (id: string, patch: Partial<Announcement>) =>
    setItems((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));

  const remove = (id: string) => setItems((prev) => prev.filter((a) => a.id !== id));

  const toggle = (id: string) => {
    const next = items.map((a) => a.id === id ? { ...a, active: !a.active } : a);
    setItems(next);
    save(next);
  };

  if (loading) return <div className="p-8 text-sm text-faint">加载中…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-ink">通知公告管理</h1>
          <p className="mt-1 text-xs text-faint">
            可选择在顶部横幅、喇叭图标或两处同时显示。支持多行内容，换行即保留。
          </p>
        </div>
        <button
          onClick={add}
          className="shrink-0 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          + 新建公告
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-faint">
          暂无公告，点击「新建公告」创建第一条
        </div>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className={`rounded-xl border p-4 ${a.active ? "border-line" : "border-line/40 opacity-60"}`}>
            {editing === a.id ? (
              <div className="space-y-3">
                {/* 第一行：类型 + 展示位置 + 状态 */}
                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] text-faint">类型</span>
                    <select
                      value={a.type}
                      onChange={(e) => update(a.id, { type: e.target.value as Announcement["type"] })}
                      className="w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                    >
                      {(Object.keys(TYPE_LABEL) as Announcement["type"][]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-faint">展示位置</span>
                    <select
                      value={a.showIn ?? "both"}
                      onChange={(e) => update(a.id, { showIn: e.target.value as Announcement["showIn"] })}
                      className="w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                    >
                      <option value="both">顶部横幅 + 喇叭</option>
                      <option value="banner">仅顶部横幅</option>
                      <option value="bell">仅喇叭图标</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-faint">状态</span>
                    <select
                      value={a.active ? "on" : "off"}
                      onChange={(e) => update(a.id, { active: e.target.value === "on" })}
                      className="w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                    >
                      <option value="on">开启</option>
                      <option value="off">关闭</option>
                    </select>
                  </label>
                </div>

                {/* 内容（多行） */}
                <label className="block space-y-1">
                  <span className="text-[10px] text-faint">公告内容（支持换行，Shift+Enter 换行）</span>
                  <textarea
                    value={a.content}
                    onChange={(e) => update(a.id, { content: e.target.value })}
                    rows={4}
                    placeholder="输入公告文字，可多行…"
                    className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-neon/50 resize-y leading-relaxed"
                  />
                </label>

                {/* 链接 */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] text-faint">链接地址（可选）</span>
                    <input
                      value={a.link ?? ""}
                      onChange={(e) => update(a.id, { link: e.target.value || undefined })}
                      placeholder="/matches 或 https://…"
                      className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-faint">链接文字（可选）</span>
                    <input
                      value={a.linkText ?? ""}
                      onChange={(e) => update(a.id, { linkText: e.target.value || undefined })}
                      placeholder="查看详情"
                      className="w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-neon/50"
                    />
                  </label>
                </div>

                {/* 操作 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(null); save(items); }}
                    className="rounded-lg bg-neon px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded-lg border border-line px-4 py-1.5 text-xs text-mut transition hover:text-ink"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => { remove(a.id); save(items.filter((x) => x.id !== a.id)); }}
                    className="ml-auto rounded-lg px-4 py-1.5 text-xs text-live transition hover:bg-live/10"
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              /* 展示态 */
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[a.type]}`}>
                      {TYPE_LABEL[a.type]}
                    </span>
                    <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-faint">
                      {SHOW_IN_LABEL[a.showIn ?? "both"]}
                    </span>
                    {!a.active && (
                      <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-faint">已关闭</span>
                    )}
                    {a.link && <span className="text-[10px] text-faint">有链接</span>}
                  </div>
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {a.content || <span className="italic text-faint">（内容为空）</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggle(a.id)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                      a.active ? "bg-neon/10 text-neon hover:bg-neon/20" : "bg-raised text-faint hover:text-ink"
                    }`}
                  >
                    {a.active ? "开启中" : "已关闭"}
                  </button>
                  <button
                    onClick={() => setEditing(a.id)}
                    className="rounded-lg border border-line px-2.5 py-1 text-[10px] text-mut transition hover:border-neon/40 hover:text-ink"
                  >
                    编辑
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 预览 */}
      {items.some((a) => a.active && (a.showIn === "both" || a.showIn === "banner")) && (
        <div className="mt-8">
          <p className="mb-2 text-xs font-semibold text-faint">顶部横幅预览</p>
          <div className="overflow-hidden rounded-xl border border-line">
            {items.filter((a) => a.active && (a.showIn === "both" || a.showIn === "banner" || !a.showIn)).map((a) => (
              <div key={a.id} className={`flex items-start gap-3 px-4 py-2.5 text-xs border-b border-line/50 last:border-0 ${TYPE_COLOR[a.type]}`}>
                <span className="shrink-0 mt-0.5">
                  {a.type === "important" ? "🔴" : a.type === "warning" ? "⚠️" : "📢"}
                </span>
                <span className="flex-1 leading-relaxed whitespace-pre-wrap">{a.content}</span>
                {a.link && a.linkText && (
                  <span className="shrink-0 underline opacity-70">{a.linkText}</span>
                )}
                <span className="shrink-0 opacity-40">✕</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-4 text-xs ${msg.startsWith("✓") ? "text-neon" : "text-live"}`}>{msg}</p>
      )}
      {saving && <p className="mt-2 text-xs text-faint">保存中…</p>}
    </div>
  );
}

export default function Page() {
  return <Suspense><AnnouncementsAdmin /></Suspense>;
}
