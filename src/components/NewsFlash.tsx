"use client";

import { useEffect, useState } from "react";

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source_name: string;
  source_url?: string;
  published_at: string;
  tags: string[];
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${diff}分钟前`;
  if (diff < 1440) return `${Math.floor(diff / 60)}小时前`;
  return `${Math.floor(diff / 1440)}天前`;
}

export default function NewsFlash({ limit = 20 }: { limit?: number }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`/api/news/feed?limit=${limit}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items ?? []); })
      .finally(() => setLoading(false));
  }, [limit]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-raised" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-faint">
        暂无快讯，稍后自动更新
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isOpen = expanded.has(item.id);
        return (
          <div
            key={item.id}
            className="card rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-sm"
          >
            <button
              onClick={() => toggle(item.id)}
              className="w-full text-left"
            >
              <div className="flex items-start gap-3">
                {/* 左侧时间轴点 */}
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink leading-snug">{item.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-faint">{item.source_name}</span>
                    <span className="text-[11px] text-faint">·</span>
                    <span className="font-num text-[11px] text-faint">{timeAgo(item.published_at)}</span>
                    {item.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="chip !text-[10px] !py-0">{tag}</span>
                    ))}
                  </div>
                </div>
                <span className={`shrink-0 text-faint transition-transform text-xs mt-0.5 ${isOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="mt-3 ml-5 border-l-2 border-neon/20 pl-3">
                <p className="text-xs text-mut leading-relaxed">{item.summary}</p>
                {item.source_url && (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[11px] text-neon underline underline-offset-2 hover:brightness-110"
                  >
                    查看原文 →
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
