"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Announcement {
  id: string;
  content: string;
  type: "info" | "warning" | "important";
  showIn?: "both" | "banner" | "bell";
  link?: string;
  linkText?: string;
}

const STYLE: Record<Announcement["type"], { bar: string; icon: string }> = {
  info:      { bar: "bg-neon/10 border-neon/20 text-neon",    icon: "📢" },
  warning:   { bar: "bg-amber/10 border-amber/20 text-amber", icon: "⚠️" },
  important: { bar: "bg-live/10 border-live/20 text-live",    icon: "🔴" },
};

export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try { sessionStorage.setItem("ann_dismissed", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  // 只展示 showIn=banner 或 both（兼容旧数据无 showIn 字段时默认显示）
  const visible = items.filter((a) =>
    !dismissed.has(a.id) && (a.showIn === "banner" || a.showIn === "both" || !a.showIn)
  );
  if (visible.length === 0) return null;

  return (
    <div className="border-b border-line">
      {visible.map((a) => {
        const s = STYLE[a.type];
        return (
          <div key={a.id} className={`flex items-start gap-3 px-4 py-2 text-xs border-b last:border-0 border-inherit ${s.bar}`}>
            <span className="shrink-0 mt-0.5 leading-none">{s.icon}</span>
            <span className="flex-1 leading-relaxed whitespace-pre-wrap">{a.content}</span>
            {a.link && a.linkText && (
              <Link
                href={a.link}
                className="shrink-0 font-semibold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
              >
                {a.linkText}
              </Link>
            )}
            <button
              aria-label="关闭公告"
              onClick={() => dismiss(a.id)}
              className="shrink-0 ml-1 opacity-50 hover:opacity-100 transition-opacity text-sm leading-none"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
