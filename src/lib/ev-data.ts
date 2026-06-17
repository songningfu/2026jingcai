import "server-only";

import { supabaseAdmin } from "./supabase";
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

/** 把 CRS key（s01s00）转为 "H:A" 标签；带 f 后缀的兜底桶返回 null 表示跳过 */
function crsKeyToScore(key: string): string | null {
  const m = key.match(/^s(\d{2})s(\d{2})(f?)$/);
  if (!m) return null;
  if (m[3] === "f") return null; // 兜底桶，排除出 EV 分析
  return `${Number(m[1])}:${Number(m[2])}`;
}

/** 把 DB 赔率行集合转为引擎需要的 markets 字典 */
function buildMarkets(rows: DbOddsRow[]): Record<string, Record<string, number>> {
  const markets: Record<string, Record<string, number>> = {};

  // 按玩法类型分组，各取最新一条（rows 已按 captured_at DESC 排序）
  const latestByPlayType = new Map<string, DbOddsRow[]>();
  for (const r of rows) {
    const key = r.play_type + (r.play_type === "handicap" ? `|${r.handicap ?? "?"}` : "");
    if (!latestByPlayType.has(key)) latestByPlayType.set(key, []);
    latestByPlayType.get(key)!.push(r);
  }

  for (const [ptKey, ptRows] of latestByPlayType) {
    const playType = ptRows[0].play_type;
    const byOutcome = new Map<string, number>();
    for (const r of ptRows) {
      if (!byOutcome.has(r.outcome)) byOutcome.set(r.outcome, Number(r.odd));
    }

    if (playType === "whl") {
      // 胜平负：outcome "主胜"/"平"/"客胜" → 引擎 "胜"/"平"/"负"
      const 胜 = byOutcome.get("主胜");
      const 平 = byOutcome.get("平");
      const 负 = byOutcome.get("客胜");
      if (胜 && 平 && 负) markets["胜平负"] = { 胜, 平, 负 };
    } else if (playType === "handicap") {
      // 让球胜平负：同上 + line 字段
      const 胜 = byOutcome.get("主胜");
      const 平 = byOutcome.get("平");
      const 负 = byOutcome.get("客胜");
      const line = ptRows[0].handicap;
      if (胜 && 平 && 负 && line !== null) {
        // 同 match_id 可能有多组让球线，只保留第一组
        if (!markets["让球胜平负"]) markets["让球胜平负"] = { line, 胜, 平, 负 };
      }
    } else if (playType === "totalgoals") {
      // 总进球：outcome "0球"/"1球"/…/"7+球" → 引擎 "0"/"1"/…/"7+"
      const tg: Record<string, number> = {};
      for (const [label, odd] of byOutcome) {
        const key = label.endsWith("+球") ? label.slice(0, -1) : label.replace("球", "");
        tg[key] = odd;
      }
      if (Object.keys(tg).length >= 3) markets["总进球"] = tg;
    } else if (playType === "score") {
      // 比分：outcome 是 CRS raw key（s01s00），转为 "1:0"；带 f 的跳过
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

/** 从 Supabase 读取近期有赔率的未开赛场次，返回引擎 EvMatch 列表 */
export async function fetchEVMatches(): Promise<EvMatch[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 5 * 24 * 3600_000).toISOString();

  const [matchesRes, oddsRes] = await Promise.all([
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
  ]);

  if (matchesRes.error || !matchesRes.data) return [];

  // 按 match_id 分组赔率
  const oddsByMatch = new Map<number, DbOddsRow[]>();
  for (const row of (oddsRes.data ?? []) as DbOddsRow[]) {
    const list = oddsByMatch.get(row.match_id) ?? [];
    list.push(row);
    oddsByMatch.set(row.match_id, list);
  }

  const matches: EvMatch[] = [];
  for (const m of matchesRes.data as DbMatch[]) {
    const rows = oddsByMatch.get(m.id);
    if (!rows || rows.length === 0) continue; // 无赔率，跳过

    const homeTeam = one(m.home);
    const awayTeam = one(m.away);
    const home = homeTeam?.name_zh ?? `队${m.id}主`;
    const away = awayTeam?.name_zh ?? `队${m.id}客`;

    const markets = buildMarkets(rows);
    // 至少要有胜平负赔率才能标定 λ
    if (!markets["胜平负"]) continue;

    matches.push({
      home,
      away,
      matchId: m.id,
      kickoffAt: m.kickoff_at,
      markets,
      refMarkets: {}, // 暂无外部参考盘接入，留空
      adjust: {},
    });
  }

  return matches;
}
