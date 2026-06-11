import "server-only";

import { getSportteryFootballOdds } from "./sporttery";
import type { SportteryMatch, SportteryOddsPayload, SportteryOddsRow } from "./sporttery-types";
import { supabaseAdmin } from "./supabase";

const MAX_KICKOFF_DIFF_MS = 3 * 60 * 60 * 1000;
const OUTCOME_LABELS = {
  h: "主胜",
  d: "平",
  a: "客胜",
} as const;

interface DbTeam {
  id?: number;
  name_zh?: string | null;
  name_en?: string | null;
}

interface DbMatch {
  id: number;
  kickoff_at: string;
  home: DbTeam | DbTeam[] | null;
  away: DbTeam | DbTeam[] | null;
}

interface OddsInsertRow {
  match_id: number;
  play_type: "whl" | "handicap";
  handicap: number | null;
  outcome: string;
  odd: number;
  captured_at: string;
}

interface MatchedSportteryMatch {
  dbMatch: DbMatch;
  sportteryMatch: SportteryMatch;
  kickoffDiffMinutes: number;
}

export interface SportteryOddsSyncResult {
  source: string;
  sourceLastUpdated: string | null;
  officialMatches: number;
  matchedMatches: number;
  insertedOdds: number;
  unmatched: Array<{
    matchId: number;
    matchNum: string;
    league: string;
    kickoffText: string;
    home: string;
    away: string;
  }>;
}

const TEAM_ALIASES: Record<string, string> = {
  "波斯尼亚和黑塞哥维那": "波黑",
  "捷克共和国": "捷克",
  "韩国队": "韩国",
  "美国队": "美国",
  "阿尔及利": "阿尔及利亚",
  "乌兹别克": "乌兹别克斯坦",
  "刚果(金)": "刚果民主共和国",
  "刚果金": "刚果民主共和国",
  "民主刚果": "刚果民主共和国",
  "佛得角群岛": "佛得角",
  "库拉索岛": "库拉索",
  "沙特": "沙特阿拉伯",
  "科特迪瓦共和国": "科特迪瓦",
  "新西兰队": "新西兰",
  "南非队": "南非",
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function canonicalTeamName(value: string | null | undefined): string {
  if (!value) return "";
  const compact = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .replace(/·/g, "");
  const aliased = TEAM_ALIASES[compact] ?? compact;
  return aliased.replace(/[()]/g, "").replace(/国家队$/, "").replace(/队$/, "");
}

function teamMatches(officialName: string, team: DbTeam | null): boolean {
  if (!team) return false;
  const official = canonicalTeamName(officialName);
  return [team.name_zh, team.name_en]
    .map(canonicalTeamName)
    .filter(Boolean)
    .some((name) => name === official);
}

function parseChinaTime(date: string | null | undefined, time: string | null | undefined): Date | null {
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalizedTime}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseChinaDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseHandicap(row: SportteryOddsRow): number | null {
  if (row.poolCode === "HAD") return 0;
  const handicap = Number(row.handicapLabel);
  return Number.isFinite(handicap) ? handicap : null;
}

function officialKickoff(match: SportteryMatch): Date | null {
  return parseChinaTime(match.matchDate, match.matchTime);
}

function findDbMatch(sportteryMatch: SportteryMatch, dbMatches: DbMatch[]): MatchedSportteryMatch | null {
  const kickoff = officialKickoff(sportteryMatch);
  if (!kickoff) return null;

  const candidates = dbMatches
    .map((dbMatch) => {
      const home = relationOne(dbMatch.home);
      const away = relationOne(dbMatch.away);
      const diffMs = Math.abs(new Date(dbMatch.kickoff_at).getTime() - kickoff.getTime());
      return { dbMatch, home, away, diffMs };
    })
    .filter(
      (candidate) =>
        candidate.diffMs <= MAX_KICKOFF_DIFF_MS &&
        teamMatches(sportteryMatch.home, candidate.home) &&
        teamMatches(sportteryMatch.away, candidate.away),
    )
    .sort((a, b) => a.diffMs - b.diffMs);

  const best = candidates[0];
  if (!best) return null;
  return {
    dbMatch: best.dbMatch,
    sportteryMatch,
    kickoffDiffMinutes: Math.round(best.diffMs / 60000),
  };
}

function toOddsRows(match: MatchedSportteryMatch, fallbackCapturedAt: string): OddsInsertRow[] {
  const rows: OddsInsertRow[] = [];

  for (const oddsRow of match.sportteryMatch.rows) {
    const capturedAt = parseChinaDateTime(oddsRow.updateAt) ?? fallbackCapturedAt;
    const playType = oddsRow.poolCode === "HAD" ? "whl" : "handicap";
    const handicap = parseHandicap(oddsRow);

    for (const outcome of oddsRow.outcomes) {
      if (outcome.odd === null) continue;
      rows.push({
        match_id: match.dbMatch.id,
        play_type: playType,
        handicap,
        outcome: OUTCOME_LABELS[outcome.key],
        odd: outcome.odd,
        captured_at: capturedAt,
      });
    }
  }

  return rows;
}

/**
 * @param payload 可选：传入已抓取的官方赔率（阿里云 FC 从国内 IP 抓后 POST 进来）；
 *                不传则自行抓取（仅在国内 IP 环境，如本机 dev，才能成功）。
 */
export async function syncSportteryOdds(
  payload?: SportteryOddsPayload,
): Promise<SportteryOddsSyncResult> {
  const data = payload ?? (await getSportteryFootballOdds());
  const officialMatches = data.days.flatMap((day) => day.matches);
  const db = supabaseAdmin();

  const { data: dbMatches, error: matchesError } = await db
    .from("matches")
    .select(
      "id, kickoff_at, home:teams!matches_home_team_id_fkey(id, name_zh, name_en), away:teams!matches_away_team_id_fkey(id, name_zh, name_en)",
    )
    .eq("competition", "WC2026")
    .order("kickoff_at", { ascending: true })
    .limit(200);

  if (matchesError) {
    throw new Error(`读取比赛失败: ${matchesError.message}`);
  }

  const matched: MatchedSportteryMatch[] = [];
  const unmatched: SportteryOddsSyncResult["unmatched"] = [];
  for (const sportteryMatch of officialMatches) {
    const dbMatch = findDbMatch(sportteryMatch, (dbMatches ?? []) as DbMatch[]);
    if (dbMatch) {
      matched.push(dbMatch);
    } else {
      unmatched.push({
        matchId: sportteryMatch.matchId,
        matchNum: sportteryMatch.matchNum,
        league: sportteryMatch.league,
        kickoffText: sportteryMatch.kickoffText,
        home: sportteryMatch.home,
        away: sportteryMatch.away,
      });
    }
  }

  const fallbackCapturedAt = new Date().toISOString();
  const oddsRows = matched.flatMap((match) => toOddsRows(match, fallbackCapturedAt));
  const matchedIds = [...new Set(matched.map((match) => match.dbMatch.id))];

  if (matchedIds.length > 0) {
    const { error: deleteError } = await db
      .from("odds")
      .delete()
      .in("match_id", matchedIds)
      .in("play_type", ["whl", "handicap"]);

    if (deleteError) {
      throw new Error(`清理旧赔率失败: ${deleteError.message}`);
    }
  }

  if (oddsRows.length > 0) {
    const { error: insertError } = await db.from("odds").insert(oddsRows);
    if (insertError) {
      throw new Error(`写入官方赔率失败: ${insertError.message}`);
    }
  }

  return {
    source: data.source,
    sourceLastUpdated: data.lastUpdated,
    officialMatches: officialMatches.length,
    matchedMatches: matched.length,
    insertedOdds: oddsRows.length,
    unmatched: unmatched.slice(0, 30),
  };
}
