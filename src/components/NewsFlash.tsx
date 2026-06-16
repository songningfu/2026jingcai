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
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/news/feed?limit=${limit}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items ?? []); })
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) {
    return (
      <div className="space-y-px overflow-hidden rounded-xl border border-line">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse bg-raised/60" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line py-14 text-center text-sm text-faint">
        暂无快讯，明日早间自动更新
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((item, idx) => {
        const isOpen = expanded === item.id;
        return (
          <div key={item.id} className={idx > 0 ? "border-t border-line" : ""}>
            <button
              onClick={() => setExpanded(isOpen ? null : item.id)}
              className="w-full px-5 py-4 text-left transition-colors hover:bg-raised/40"
            >
              <div className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium leading-snug text-ink">{item.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-faint">{item.source_name}</span>
                    <span className="text-[10px] text-line-strong">·</span>
                    <span className="font-num text-[11px] text-faint">{timeAgo(item.published_at)}</span>
                    {item.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="chip !py-0 !text-[10px]">{tag}</span>
                    ))}
                  </div>
                </div>
                <span className={`ml-2 mt-1 shrink-0 text-[11px] text-faint transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-line/60 bg-raised/30 px-5 py-4">
                <p className="text-[13px] leading-relaxed text-mut">{item.summary}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
