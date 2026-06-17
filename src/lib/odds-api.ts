import "server-only";

/**
 * The Odds API v4 参考盘接入
 * 仅用于 EV 引擎内部 λ 标定，不展示给用户、不作为投注依据。
 * 免费额度：500 次/月；Next.js fetch 缓存 2h，预计 <360 次/月。
 */

import { TEAM_NAMES_ZH } from "./team-names";

const BASE_URL = "https://api.the-odds-api.com/v4";

// 按锐度排序：贴水最低、限额最高的庄家最可靠
const PREFERRED_BOOKS = ["pinnacle", "betfair_ex_eu", "betfair_ex_uk", "unibet_eu", "williamhill"];

// The Odds API 队名别名 → 标准英文名（与 TEAM_NAMES_ZH 键一致）
const NAME_ALIASES: Record<string, string> = {
  "USA":                           "United States",
  "Republic of Korea":             "South Korea",
  "Korea Republic":                "South Korea",
  "Côte d'Ivoire":                 "Ivory Coast",
  "Cote d'Ivoire":                 "Ivory Coast",
  "IR Iran":                       "Iran",
  "Bosnia and Herzegovina":        "Bosnia-Herzegovina",
  "DR Congo":                      "Congo DR",
  "Democratic Republic of Congo":  "Congo DR",
  "Czech Republic":                "Czechia",
  "New Zealand":                   "New Zealand",
  "Curacao":                       "Curaçao",
};

function normalize(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

// ── Odds API 原始类型 ────────────────────────────────────────

interface ApiOutcome {
  name: string;
  price: number;
  point?: number;
}
interface ApiMarket {
  key: string;
  outcomes: ApiOutcome[];
}
interface ApiBookmaker {
  key: string;
  markets: ApiMarket[];
}
interface ApiMatch {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: ApiBookmaker[];
}

// ── 输出类型 ─────────────────────────────────────────────────

export interface RefOdds {
  /** 胜平负参考赔率（主胜/平/客胜） */
  h2h?: { 胜: number; 平: number; 负: number };
  /** 亚盘参考赔率（主队让球线 + 主/客赔率） */
  asianHandicap?: { line: number; 主: number; 客: number };
  /** 大小球参考赔率（盘口 + 大/小赔率） */
  totals?: { line: number; 大: number; 小: number };
}

// ── 内部工具 ─────────────────────────────────────────────────

function bestMarket(bookmakers: ApiBookmaker[], marketKey: string): ApiMarket | null {
  for (const pref of PREFERRED_BOOKS) {
    const bm = bookmakers.find(b => b.key === pref);
    if (!bm) continue;
    const m = bm.markets.find(m => m.key === marketKey);
    if (m && m.outcomes.length >= 2) return m;
  }
  for (const bm of bookmakers) {
    const m = bm.markets.find(m => m.key === marketKey);
    if (m && m.outcomes.length >= 2) return m;
  }
  return null;
}

function parseH2H(market: ApiMarket, homeEn: string, awayEn: string): RefOdds["h2h"] | undefined {
  const home = market.outcomes.find(o => normalize(o.name) === homeEn);
  const draw = market.outcomes.find(o => o.name === "Draw");
  const away = market.outcomes.find(o => normalize(o.name) === awayEn);
  if (home && draw && away) return { 胜: home.price, 平: draw.price, 负: away.price };
}

function parseAH(market: ApiMarket, homeEn: string, awayEn: string): RefOdds["asianHandicap"] | undefined {
  const home = market.outcomes.find(o => normalize(o.name) === homeEn);
  const away = market.outcomes.find(o => normalize(o.name) === awayEn);
  if (home && away && home.point !== undefined) {
    return { line: home.point, 主: home.price, 客: away.price };
  }
}

function parseTotals(market: ApiMarket): RefOdds["totals"] | undefined {
  const over = market.outcomes.find(o => o.name === "Over");
  const under = market.outcomes.find(o => o.name === "Under");
  if (over && under && over.point !== undefined) {
    return { line: over.point, 大: over.price, 小: under.price };
  }
}

// ── 主函数 ───────────────────────────────────────────────────

/**
 * 从 The Odds API 拉取近期世界杯参考盘赔率。
 * 返回 Map，key = "主队中文名|客队中文名"，value = RefOdds。
 * 若 ODDS_API_KEY 未配置或请求失败，返回空 Map（引擎自动退回体彩盘标定）。
 */
export async function fetchRefOdds(): Promise<Map<string, RefOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return new Map();

  const sportKey = process.env.ODDS_API_SPORT_KEY ?? "soccer_fifa_world_cup";
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 24 * 3600_000);
  const params = new URLSearchParams({
    apiKey,
    regions: "eu",
    markets: "h2h,totals",
    oddsFormat: "decimal",
    commenceTimeFrom: now.toISOString(),
    commenceTimeTo: soon.toISOString(),
  });

  let raw: ApiMatch[];
  try {
    const res = await fetch(`${BASE_URL}/sports/${sportKey}/odds/?${params}`, {
      next: { revalidate: 7200 }, // 2 小时缓存，月均 < 360 次
    });
    if (!res.ok) {
      console.warn(`[odds-api] ${res.status} ${await res.text()}`);
      return new Map();
    }
    raw = await res.json();
    if (!Array.isArray(raw)) return new Map();
  } catch (e) {
    console.warn("[odds-api] fetch error:", e);
    return new Map();
  }

  const result = new Map<string, RefOdds>();

  for (const match of raw) {
    const homeEn = normalize(match.home_team);
    const awayEn = normalize(match.away_team);
    const homeZh = TEAM_NAMES_ZH[homeEn];
    const awayZh = TEAM_NAMES_ZH[awayEn];
    if (!homeZh || !awayZh) continue; // 非本届参赛队，跳过

    const ref: RefOdds = {};

    const h2hM = bestMarket(match.bookmakers, "h2h");
    if (h2hM) ref.h2h = parseH2H(h2hM, homeEn, awayEn);

    const ahM = bestMarket(match.bookmakers, "asian_handicap");
    if (ahM) ref.asianHandicap = parseAH(ahM, homeEn, awayEn);

    const totM = bestMarket(match.bookmakers, "totals");
    if (totM) ref.totals = parseTotals(totM);

    if (ref.h2h || ref.asianHandicap || ref.totals) {
      result.set(`${homeZh}|${awayZh}`, ref);
    }
  }

  console.log(`[odds-api] 拉取到 ${result.size} 场参考盘赔率（来自 ${raw.length} 场原始数据）`);
  return result;
}
