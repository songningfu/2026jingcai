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
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-raised" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-faint">
        暂无快讯，明日早间自动更新
      </div>
    );
  }

  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((item) => {
        const isOpen = expanded.has(item.id);
        return (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className="w-full px-4 py-3.5 text-left transition-colors hover:bg-raised/60"
          >
            <div className="flex items-start gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-faint">{item.source_name}</span>
                  <span className="text-[11px] text-faint">·</span>
                  <span className="font-num text-[11px] text-faint">{timeAgo(item.published_at)}</span>
                  {item.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="chip !py-0 !text-[10px]">{tag}</span>
                  ))}
                </div>
                {isOpen && item.summary && (
                  <p className="mt-2 text-xs leading-relaxed text-mut">{item.summary}</p>
                )}
                {isOpen && item.source_url && (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 inline-block text-[11px] text-neon hover:underline"
                  >
                    查看原文 →
                  </a>
                )}
              </div>
              <span className={`shrink-0 text-[10px] text-faint transition-transform mt-1 ${isOpen ? "rotate-180" : ""}`}>
                ▾
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
