/**
 * sync_matches()：football-data.org → Supabase（规格文档 4.1）
 * 由 /api/sync 触发（本地手动 / 部署后 Vercel Cron 每分钟）。
 */
import { getWorldCupMatches, type FdMatch, type FdMatchStatus } from "./football-data";
import { supabaseAdmin } from "./supabase";
import { teamNameZh } from "./team-names";

/** football-data 状态 → 库内状态（scheduled / live / finished） */
function mapStatus(s: FdMatchStatus): string {
  switch (s) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    default:
      return s.toLowerCase(); // postponed / cancelled / suspended
  }
}

const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE: "group",
  LAST_32: "round32",
  LAST_16: "round16",
  QUARTER_FINALS: "quarter",
  SEMI_FINALS: "semi",
  THIRD_PLACE: "third",
  FINAL: "final",
};

export async function syncMatches(): Promise<{ teams: number; matches: number }> {
  const fdMatches = await getWorldCupMatches();
  const db = supabaseAdmin();

  // 1) 球队：从赛程中收集（小组赛阶段带小组信息）
  const teamMap = new Map<
    number,
    { id: number; name_zh: string; name_en: string; group_name: string | null; logo_url: string | null }
  >();
  for (const m of fdMatches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!t.id || !t.name) continue;
      const existing = teamMap.get(t.id);
      const group =
        m.stage === "GROUP_STAGE" && m.group
          ? m.group.replace("GROUP_", "")
          : (existing?.group_name ?? null);
      teamMap.set(t.id, {
        id: t.id,
        name_zh: teamNameZh(t.name),
        name_en: t.name,
        group_name: group,
        logo_url: t.crest,
      });
    }
  }
  const teams = [...teamMap.values()];
  const { error: teamErr } = await db.from("teams").upsert(teams);
  if (teamErr) throw new Error(`teams upsert 失败: ${teamErr.message}`);

  // 2) 比赛
  const rows = fdMatches.map((m: FdMatch) => ({
    id: m.id,
    competition: "WC2026",
    stage: STAGE_MAP[m.stage] ?? m.stage.toLowerCase(),
    group_name: m.group ? m.group.replace("GROUP_", "") : null,
    home_team_id: m.homeTeam.id,
    away_team_id: m.awayTeam.id,
    kickoff_at: m.utcDate,
    status: mapStatus(m.status),
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
    ht_home: m.score.halfTime.home,
    ht_away: m.score.halfTime.away,
    updated_at: new Date().toISOString(),
  }));
  const { error: matchErr } = await db.from("matches").upsert(rows);
  if (matchErr) throw new Error(`matches upsert 失败: ${matchErr.message}`);

  return { teams: teams.length, matches: rows.length };
}
