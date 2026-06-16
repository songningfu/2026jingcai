import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { filterContent } from "@/lib/banned-terms";

const RSS_FEEDS = [
  { url: "https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml", source: "BBC Sport" },
  { url: "https://www.espn.com/espn/rss/soccer/news", source: "ESPN" },
];

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"))
    ?? xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseItems(xml: string) {
  const items: Array<{ title: string; summary: string; link: string; pubDate: string }> = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = extractTag(block, "title");
    const summary = (extractTag(block, "description") || extractTag(block, "summary"))
      .replace(/<[^>]+>/g, "").trim();
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || extractTag(block, "updated");
    if (title) items.push({ title, summary, link, pubDate });
  }
  return items;
}

const WC_KEYWORDS = ["world cup", "世界杯", "fifa", "2026", "soccer", "football"];

function isWCRelated(title: string, summary: string) {
  const text = (title + " " + summary).toLowerCase();
  return WC_KEYWORDS.some((kw) => text.includes(kw));
}

async function translateBatch(items: Array<{ title: string; summary: string }>) {
  const key = process.env.DEEPSEEK_API_KEY;
  const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
  if (!key) throw new Error("缺少 DEEPSEEK_API_KEY");

  const payload = items.map((it, i) => ({ i, title: it.title, summary: it.summary.slice(0, 200) }));

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是体育新闻翻译助手。将英文世界杯新闻翻译成中文。只输出 JSON，不要任何解释。" },
        { role: "user", content: `将以下条目翻译成中文，直接输出 JSON 对象，格式：{"items":[{"i":0,"title":"中文","summary":"中文"}]}\n\n${JSON.stringify(payload)}` },
      ],
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`translate API error: ${res.status}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  // 从文本中提取 JSON（兼容推理模型在思考后输出 JSON 的情况）
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`无法从翻译响应中提取 JSON: ${text.slice(0, 100)}`);
  const parsed = JSON.parse(match[0]) as { items: Array<{ i: number; title: string; summary: string }> };
  return new Map(parsed.items.map((it) => [it.i, it]));
}

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  let inserted = 0;
  let skipped = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
        next: { revalidate: 0 },
      });
      if (!res.ok) { skipped++; continue; }
      const xml = await res.text();
      const allItems = parseItems(xml).filter((it) => isWCRelated(it.title, it.summary));

      if (allItems.length === 0) continue;

      // 批量翻译
      let translated: Map<number, { title: string; summary: string }> = new Map();
      try {
        translated = await translateBatch(allItems);
      } catch (e) {
        console.error("[news/sync] translate error:", e);
      }

      for (let idx = 0; idx < allItems.length; idx++) {
        const item = allItems[idx];
        const tr = translated.get(idx);
        const title = filterContent(tr?.title || item.title).text;
        const summary = filterContent(tr?.summary || item.summary || item.title).text;
        const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

        const { error } = await db.from("news_flash").upsert(
          {
            title,
            summary,
            source_name: feed.source,
            source_url: item.link || null,
            published_at: pubDate,
            tags: ["世界杯"],
          },
          { onConflict: "source_name,title", ignoreDuplicates: true }
        );
        if (error) { skipped++; } else { inserted++; }
      }
    } catch (e) {
      console.error(`[news/sync] feed error (${feed.source}):`, e);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped });
}
