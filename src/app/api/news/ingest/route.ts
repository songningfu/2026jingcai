import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { filterContent } from "@/lib/banned-terms";

interface NewsItem {
  title: string;
  summary: string;
  source_name: string;
  source_url?: string;
  published_at: string;
  tags?: string[];
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const items: NewsItem[] = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const db = supabaseAdmin();
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const cleanTitle = filterContent(item.title).text;
    const cleanSummary = filterContent(item.summary).text;

    const { error } = await db.from("news_flash").upsert(
      {
        title: cleanTitle,
        summary: cleanSummary,
        source_name: item.source_name,
        source_url: item.source_url ?? null,
        published_at: item.published_at,
        tags: item.tags ?? [],
      },
      { onConflict: "source_name,title", ignoreDuplicates: true }
    );

    if (error) {
      console.error("[news/ingest] error:", error.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped });
}
