import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/** GET → 推演页比赛列表：未开赛的近期场次（含中文队名） */

interface TeamRef {
  name_zh?: string | null;
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("matches")
      .select(
        "id, kickoff_at, group_name, stage, home:teams!matches_home_team_id_fkey(name_zh), away:teams!matches_away_team_id_fkey(name_zh)",
      )
      .eq("status", "scheduled")
      .gte("kickoff_at", new Date().toISOString())
      .order("kickoff_at")
      .limit(20);
    if (error) throw new Error(error.message);

    const matches = (data ?? []).map((m) => ({
      id: m.id,
      home: one(m.home as TeamRef | TeamRef[] | null)?.name_zh ?? "待定",
      away: one(m.away as TeamRef | TeamRef[] | null)?.name_zh ?? "待定",
      kickoff: m.kickoff_at as string,
      group: (m.group_name as string | null) ?? null,
      stage: (m.stage as string) ?? "group",
    }));
    return NextResponse.json({ ok: true, matches });
  } catch (e) {
    return NextResponse.json(
      { ok: false, matches: [], error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
