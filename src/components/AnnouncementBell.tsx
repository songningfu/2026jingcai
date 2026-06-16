"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Announcement {
  id: string;
  content: string;
  type: "info" | "warning" | "important";
  showIn?: "both" | "banner" | "bell";
  link?: string;
  linkText?: string;
}

const TYPE_COLOR: Record<Announcement["type"], string> = {
  info:      "text-neon",
  warning:   "text-amber",
  important: "text-live",
};

const TYPE_DOT: Record<Announcement["type"], string> = {
  info:      "bg-neon",
  warning:   "bg-amber",
  important: "bg-live",
};

export default function AnnouncementBell() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ann_dismissed");
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
    fetch("/api/home/announcements")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try { sessionStorage.setItem("ann_dismissed", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  // 喇叭显示 showIn=bell 或 both（兼容旧数据）
  const bellItems = items.filter((a) => a.showIn === "bell" || a.showIn === "both" || !a.showIn);
  const unread = bellItems.filter((a) => !dismissed.has(a.id));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-raised text-ink" : "text-faint hover:bg-raised hover:text-mut"
        }`}
        aria-label="公告"
        title="公告"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 1 0 8" />
          <path d="M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2l5 4V4L6 8z" />
          <path d="M15 9.5a3 3 0 0 1 0 5" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-live" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-line bg-white shadow-lg">
          <div className="border-b border-line px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">公告</p>
            {unread.length > 0 && (
              <span className="font-num text-[10px] text-faint">{unread.length} 条未读</span>
            )}
          </div>
          {bellItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-faint">暂无公告</div>
          ) : (
            <div className="divide-y divide-line max-h-72 overflow-y-auto">
              {bellItems.map((a) => {
                const read = dismissed.has(a.id);
                return (
                  <div key={a.id} className={`px-4 py-3 flex gap-3 items-start transition-colors ${read ? "opacity-40" : ""}`}>
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[a.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed whitespace-pre-wrap ${read ? "text-faint" : "text-ink"}`}>
                        {a.content}
                      </p>
                      {a.link && a.linkText && (
                        <Link
                          href={a.link}
                          onClick={() => setOpen(false)}
                          className={`mt-1 block text-[11px] font-semibold underline underline-offset-2 ${TYPE_COLOR[a.type]}`}
                        >
                          {a.linkText} →
                        </Link>
                      )}
                    </div>
                    {!read && (
                      <button
                        aria-label="标为已读"
                        onClick={() => dismiss(a.id)}
                        className="shrink-0 text-faint hover:text-mut transition-colors text-sm leading-none mt-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
