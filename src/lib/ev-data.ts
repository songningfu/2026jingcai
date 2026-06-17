import "server-only";

import { supabaseAdmin } from "./supabase";
import { fetchRefOdds } from "./odds-api";
import type { EvMatch } from "./ev-engine";

interface DbOddsRow {
  match_id: number;
  play_type: string;
  handicap: number | null;
  outcome: string;
  odd: number;
  captured_at: string;
}

interface DbTeam {
  name_zh?: string | null;
}

interface DbMatch {
  id: number;
  kickoff_at: string;
  status: string | null;
  home: DbTeam | DbTeam[] | null;
  away: DbTeam | DbTeam[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** CRS raw key → "H:A" 分；带 f 后缀的兜底桶返回 null（跳过） */
function crsKeyToScore(key: string): string | null {
  const m = key.match(/^s(\d{2})s(\d{2})(f?)$/);
  if (!m || m[3] === "f") return null;
  return `${Number(m[1])}:${Number(m[2])}`;
}

/** DB 赔率行 → 引擎 markets 字典 */
function buildMarkets(rows: DbOddsRow[]): Record<string, Record<string, number>> {
  const markets: Record<string, Record<string, number>> = {};

  // 按玩法分组，各取最新一条（rows 已按 captured_at DESC 排序）
  const groups = new Map<string, DbOddsRow[]>();
  for (const r of rows) {
    const key = r.play_type + (r.play_type === "handicap" ? `|${r.handicap ?? "?"}` : "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const ptRows of groups.values()) {
    const byOutcome = new Map<string, number>();
    for (const r of ptRows) {
      if (!byOutcome.has(r.outcome)) byOutcome.set(r.outcome, Number(r.odd));
    }
    const pt = ptRows[0].play_type;

    if (pt === "whl") {
      const 胜 = byOutcome.get("主胜"), 平 = byOutcome.get("平"), 负 = byOutcome.get("客胜");
      if (胜 && 平 && 负) markets["胜平负"] = { 胜, 平, 负 };

    } else if (pt === "handicap") {
      const 胜 = byOutcome.get("主胜"), 平 = byOutcome.get("平"), 负 = byOutcome.get("客胜");
      const line = ptRows[0].handicap;
      if (胜 && 平 && 负 && line !== null && !markets["让球胜平负"])
        markets["让球胜平负"] = { line, 胜, 平, 负 };

    } else if (pt === "totalgoals") {
      const tg: Record<string, number> = {};
      for (const [label, odd] of byOutcome) {
        // "0球"→"0", "7+球"→"7+"
        const key = label.endsWith("+球") ? label.slice(0, -1) : label.replace("球", "");
        tg[key] = odd;
      }
      if (Object.keys(tg).length >= 3) markets["总进球"] = tg;

    } else if (pt === "score") {
      const cs: Record<string, number> = {};
      for (const [crsKey, odd] of byOutcome) {
        const score = crsKeyToScore(crsKey);
        if (score) cs[score] = odd;
      }
      if (Object.keys(cs).length >= 3) markets["比分"] = cs;
    }
  }

  return markets;
}

/**
 * 从 Supabase 读取近期未开赛场次赔率，并自动合并 The Odds API 参考盘。
 * 参考盘用于 EV 引擎内部 λ 标定，不展示给用户。
 */
export async function fetchEVMatches(): Promise<EvMatch[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 5 * 24 * 3600_000).toISOString();

  const [matchesRes, oddsRes, refOddsMap] = await Promise.all([
    db
      .from("matches")
      .select(
        "id, kickoff_at, status, home:teams!matches_home_team_id_fkey(name_zh), away:teams!matches_away_team_id_fkey(name_zh)",
      )
      .gte("kickoff_at", now)
      .lte("kickoff_at", future)
      .order("kickoff_at")
      .limit(20),
    db
      .from("odds")
      .select("match_id, play_type, handicap, outcome, odd, captured_at")
      .order("captured_at", { ascending: false })
      .limit(5000),
    fetchRefOdds().catch(() => new Map()),
  ]);

  if (matchesRes.error || !matchesRes.data) return [];

  const oddsByMatch = new Map<number, DbOddsRow[]>();
  for (const row of (oddsRes.data ?? []) as DbOddsRow[]) {
    const list = oddsByMatch.get(row.match_id) ?? [];
    list.push(row);
    oddsByMatch.set(row.match_id, list);
  }

  const result: EvMatch[] = [];

  for (const m of matchesRes.data as DbMatch[]) {
    const rows = oddsByMatch.get(m.id);
    if (!rows || rows.length === 0) continue;

    const home = one(m.home)?.name_zh ?? `主${m.id}`;
    const away = one(m.away)?.name_zh ?? `客${m.id}`;

    const markets = buildMarkets(rows);
    if (!markets["胜平负"]) continue;

    // 从 The Odds API 合并参考盘
    const refData = refOddsMap.get(`${home}|${away}`);
    const refMarkets: Record<string, Record<string, number>> = {};
    if (refData?.h2h) refMarkets["胜平负"] = refData.h2h;
    if (refData?.asianHandicap) refMarkets["亚盘"] = refData.asianHandicap;
    if (refData?.totals) refMarkets["大小球"] = refData.totals;

    result.push({
      home, away,
      matchId: m.id,
      kickoffAt: m.kickoff_at,
      markets,
      refMarkets,
      adjust: {},
    });
  }

  return result;
}
