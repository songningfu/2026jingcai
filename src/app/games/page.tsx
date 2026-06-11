import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import GamesClient, { type GameMatch } from "./GamesClient";

export const metadata: Metadata = {
  title: "积分竞猜",
  description:
    "用虚拟积分竞猜世界杯赛果，赛后自动结算、登上排行榜。积分不可充值、不可提现、不可兑换现金。",
};

export const revalidate = 60;

interface TeamRef {
  name_zh?: string | null;
  logo_url?: string | null;
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function getUpcomingMatches(): Promise<GameMatch[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const until = new Date(Date.now() + 72 * 3600_000).toISOString();

  const [matchesRes, oddsRes] = await Promise.all([
    db
      .from("matches")
      .select(
        "id, kickoff_at, group_name, stage, home:teams!matches_home_team_id_fkey(name_zh, logo_url), away:teams!matches_away_team_id_fkey(name_zh, logo_url)",
      )
      .eq("status", "scheduled")
      .gte("kickoff_at", now)
      .lte("kickoff_at", until)
      .order("kickoff_at")
      .limit(20),
    db
      .from("odds")
      .select("match_id, outcome, odd, captured_at")
      .eq("play_type", "whl")
      .order("captured_at", { ascending: false })
      .limit(600),
  ]);

  const oddsMap = new Map<number, { win?: number; draw?: number; loss?: number }>();
  for (const r of oddsRes.data ?? []) {
    const e = oddsMap.get(r.match_id) ?? {};
    const key = r.outcome === "主胜" ? "win" : r.outcome === "平" ? "draw" : r.outcome === "客胜" ? "loss" : null;
    if (key && e[key] === undefined) e[key] = Number(r.odd);
    oddsMap.set(r.match_id, e);
  }

  return (matchesRes.data ?? []).map((m) => {
    const home = one(m.home as TeamRef | TeamRef[] | null);
    const away = one(m.away as TeamRef | TeamRef[] | null);
    const o = oddsMap.get(m.id) ?? {};
    return {
      id: m.id,
      home: home?.name_zh ?? "待定",
      away: away?.name_zh ?? "待定",
      homeLogo: home?.logo_url ?? null,
      awayLogo: away?.logo_url ?? null,
      kickoff: m.kickoff_at as string,
      group: (m.group_name as string | null) ?? null,
      mult: {
        win: o.win ?? 2.0,
        draw: o.draw ?? 2.0,
        loss: o.loss ?? 2.0,
      },
    };
  });
}

export default async function GamesPage() {
  const matches = await getUpcomingMatches();
  return <GamesClient matches={matches} />;
}
