import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const db = supabaseAdmin();

    const [{ data: teams }, { data: matches }] = await Promise.all([
      db.from("teams").select("id, name_zh, group_name, logo_url").order("group_name").order("name_zh"),
      db.from("matches").select("id, home_team_id, away_team_id, kickoff_at, status, stage, group_name, home_score, away_score").order("kickoff_at"),
    ]);

    const groups = [...new Set((teams ?? []).map((t: Record<string, unknown>) => t.group_name as string).filter(Boolean))].sort();

    return NextResponse.json({
      ok: true,
      groups,
      teams: (teams ?? []).map((t: Record<string, unknown>) => ({
        id: t.id,
        name: t.name_zh,
        group: t.group_name ?? null,
        logo: t.logo_url ?? null,
        players: 0,
        avgAge: null,
      })),
      matches: (matches ?? []).map((m: Record<string, unknown>) => ({
        id: m.id,
        homeId: m.home_team_id,
        awayId: m.away_team_id,
        kickoff: m.kickoff_at,
        status: m.status,
        stage: m.stage ?? "group",
        group: m.group_name ?? null,
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}
