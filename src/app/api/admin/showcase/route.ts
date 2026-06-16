import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase";

export interface ShowcaseItem {
  home: string;
  away: string;
  label: "比分命中" | "胜负命中";
  result: string; // "2:0" 或 "法国胜" 等
}

const KEY = "showcase_predictions";

const DEFAULT_ITEMS: ShowcaseItem[] = [
  { home: "法国", away: "摩洛哥", label: "比分命中", result: "2:0" },
  { home: "阿根廷", away: "克罗地亚", label: "比分命中", result: "3:0" },
  { home: "英格兰", away: "法国", label: "胜负命中", result: "法国胜" },
  { home: "葡萄牙", away: "摩洛哥", label: "胜负命中", result: "葡萄牙胜" },
];

async function getShowcase(): Promise<ShowcaseItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_ITEMS;
  return (data.value as ShowcaseItem[]) ?? DEFAULT_ITEMS;
}

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const items = await getShowcase();
  return NextResponse.json({ ok: true, items });
}

export async function PUT(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const items: ShowcaseItem[] = Array.isArray(body.items) ? body.items.slice(0, 6) : [];
  const db = supabaseAdmin();
  const { error } = await db.from("site_settings").upsert(
    { key: KEY, value: items, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items });
}
