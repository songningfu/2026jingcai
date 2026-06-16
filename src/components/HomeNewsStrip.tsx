import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${diff}分钟前`;
  if (diff < 1440) return `${Math.floor(diff / 60)}小时前`;
  return `${Math.floor(diff / 1440)}天前`;
}

export default async function HomeNewsStrip() {
  const db = supabaseAdmin();
  const { data } = await db
    .from("news_flash")
    .select("id,title,source_name,published_at,tags")
    .eq("is_active", true)
    .order("published_at", { ascending: false })
    .limit(4);

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">快讯</h2>
        <Link href="/news" className="text-xs text-neon hover:underline">
          更多 →
        </Link>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {data.map((item) => (
          <Link
            key={item.id}
            href="/news"
            className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-raised/60"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-faint">{item.source_name}</span>
                <span className="text-[11px] text-faint">·</span>
                <span className="font-num text-[11px] text-faint">{timeAgo(item.published_at)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
