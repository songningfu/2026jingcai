import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Announcement } from "@/app/api/admin/announcements/route";

export const revalidate = 60;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("site_settings")
      .select("value")
      .eq("key", "announcements")
      .maybeSingle();
    const all: Announcement[] = (data?.value as Announcement[]) ?? [];
    const active = all.filter((a) => a.active);
    return NextResponse.json({ ok: true, items: active });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
