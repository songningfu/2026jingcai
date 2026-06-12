import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET → 世界杯关系图谱数据（推演页 MiroFish 风格图谱用）
 * 节点：12 小组 + 48 球队 + 双方已确定的比赛；边：球队-小组（隶属）、比赛-球队（主/客）。
 */

export interface GraphTeam {
  id: number;
  name: string;
  group: string | null;
  logo: string | null;
  players: number;
  avgAge: number | null;
}
export interface GraphMatch {
  id: number;
  homeId: number;
  awayId: number;
  kickoff: string;
  status: string;
  stage: string;
  group: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const [teamsRes, matchesRes, squadsRes] = await Promise.all([
      db.from("teams").select("id, name_zh, group_name, logo_url").limit(64),
      db
        .from("matches")
        .select("id, home_team_id, away_team_id, kickoff_at, status, stage, group_name, home_score, away_score")
        .not("home_team_id", "is", null)
        .not("away_team_id", "is", null)
        .order("kickoff_at")
        .limit(150),
      db.from("squads").select("team_id, date_of_birth").limit(2000),
    ]);
    if (teamsRes.error) throw new Error(teamsRes.error.message);

    // 球队聚合：名单人数 / 平均年龄
    const agg = new Map<number, { count: number; ageSum: number; ageN: number }>();
    for (const s of squadsRes.data ?? []) {
      const e = agg.get(s.team_id) ?? { count: 0, ageSum: 0, ageN: 0 };
      e.count += 1;
      if (s.date_of_birth) {
        const t = new Date(s.date_of_birth).getTime();
        if (!Number.isNaN(t)) {
          e.ageSum += (Date.now() - t) / (365.25 * 24 * 3600_000);
          e.ageN += 1;
        }
      }
      agg.set(s.team_id, e);
    }

    const teams: GraphTeam[] = (teamsRes.data ?? []).map((t) => {
      const a = agg.get(t.id);
      return {
        id: t.id,
        name: t.name_zh as string,
        group: (t.group_name as string | null) ?? null,
        logo: (t.logo_url as string | null) ?? null,
        players: a?.count ?? 0,
        avgAge: a && a.ageN > 0 ? Number((a.ageSum / a.ageN).toFixed(1)) : null,
      };
    });

    const matches: GraphMatch[] = (matchesRes.data ?? []).map((m) => ({
      id: m.id,
      homeId: m.home_team_id as number,
      awayId: m.away_team_id as number,
      kickoff: m.kickoff_at as string,
      status: (m.status as string) ?? "scheduled",
      stage: (m.stage as string) ?? "group",
      group: (m.group_name as string | null) ?? null,
      homeScore: (m.home_score as number | null) ?? null,
      awayScore: (m.away_score as number | null) ?? null,
    }));

    const groups = [...new Set(teams.map((t) => t.group).filter(Boolean))].sort() as string[];

    return NextResponse.json({ ok: true, groups, teams, matches });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
