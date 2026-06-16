import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase";

export interface Announcement {
  id: string;
  content: string;
  type: "info" | "warning" | "important";
  showIn: "both" | "banner" | "bell"; // 展示位置：顶部横幅/仅喇叭/两者都显
  link?: string;
  linkText?: string;
  active: boolean;
}

const KEY = "announcements";

const DEFAULT: Announcement[] = [];

async function getAll(): Promise<Announcement[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("site_settings").select("value").eq("key", KEY).maybeSingle();
  if (!data) return DEFAULT;
  return (data.value as Announcement[]) ?? DEFAULT;
}

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const items = await getAll();
  return NextResponse.json({ ok: true, items });
}

export async function PUT(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const items: Announcement[] = Array.isArray(body.items) ? body.items : [];
  const db = supabaseAdmin();
  const { error } = await db.from("site_settings").upsert(
    { key: KEY, value: items, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items });
}
