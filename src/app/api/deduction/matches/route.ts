import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    const window = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: matchRows, error } = await db
      .from("matches")
      .select("id, home_team:teams!matches_home_team_id_fkey(id, name_zh, logo_url), away_team:teams!matches_away_team_id_fkey(id, name_zh, logo_url), kickoff_at, group_name, stage, status, home_score, away_score")
      .gte("kickoff_at", now)
      .lte("kickoff_at", window)
      .in("status", ["scheduled", "live"])
      .not("home_team_id", "is", null)
      .not("away_team_id", "is", null)
      .order("kickoff_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    const matchIds = (matchRows ?? []).map((m: Record<string, unknown>) => m.id as number);

    // 获取这批比赛的最新赔率
    const { data: oddsRows } = matchIds.length
      ? await db
          .from("odds")
          .select("match_id, outcome, odd, captured_at")
          .in("match_id", matchIds)
          .eq("play_type", "whl")
          .order("captured_at", { ascending: false })
          .limit(matchIds.length * 9)
      : { data: [] };

    // 每场比赛取最新一组赔率
    const oddsMap = new Map<number, { win?: number; draw?: number; loss?: number }>();
    for (const row of oddsRows ?? []) {
      const r = row as { match_id: number; outcome: string; odd: number };
      if (!oddsMap.has(r.match_id)) oddsMap.set(r.match_id, {});
      const entry = oddsMap.get(r.match_id)!;
      if (r.outcome === "主胜" && entry.win === undefined) entry.win = r.odd;
      if (r.outcome === "平" && entry.draw === undefined) entry.draw = r.odd;
      if (r.outcome === "客胜" && entry.loss === undefined) entry.loss = r.odd;
    }

    const matches = (matchRows ?? []).map((m: Record<string, unknown>) => {
      const homeTeam = m.home_team as { id: number; name_zh: string; logo_url: string | null } | null;
      const awayTeam = m.away_team as { id: number; name_zh: string; logo_url: string | null } | null;
      const id = m.id as number;
      const odds = oddsMap.get(id);
      return {
        id,
        home: homeTeam?.name_zh ?? "待定",
        away: awayTeam?.name_zh ?? "待定",
        homeLogo: homeTeam?.logo_url ?? null,
        awayLogo: awayTeam?.logo_url ?? null,
        kickoff: m.kickoff_at,
        group: m.group_name ?? null,
        stage: m.stage ?? "group",
        homeScore: typeof m.home_score === "number" ? m.home_score : null,
        awayScore: typeof m.away_score === "number" ? m.away_score : null,
        odds: odds?.win && odds?.draw && odds?.loss
          ? { win: odds.win, draw: odds.draw, loss: odds.loss }
          : null,
      };
    });

    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json({ matches: [], error: String(e) }, { status: 200 });
  }
}
