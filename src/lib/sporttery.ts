import "server-only";

import { impliedProbabilities } from "./odds";
import type {
  SportteryMatch,
  SportteryMatchDay,
  SportteryOddsPayload,
  SportteryOddsRow,
  SportteryOutcome,
} from "./sporttery-types";

type SportteryOutcomeKey = string;

const SPORTTERY_ODDS_URL =
  "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c&poolCode=had,hhad,ttg,mnts,crs";

interface RawSportteryResponse {
  errorCode?: string;
  errorMessage?: string;
  success?: boolean;
  value?: {
    lastUpdateTime?: string;
    matchInfoList?: RawSportteryDay[];
  };
}

interface RawSportteryDay {
  businessDate: string;
  subMatchList?: RawSportteryMatch[];
}

interface RawSportteryPoolOdds {
  h?: string;
  d?: string;
  a?: string;
  goalLine?: string;
  updateDate?: string;
  updateTime?: string;
}

interface RawSportteryTTG {
  s0?: string; s1?: string; s2?: string; s3?: string;
  s4?: string; s5?: string; s6?: string; s7?: string;
  updateDate?: string; updateTime?: string;
}

interface RawSportteryMNTS {
  hh?: string; hd?: string; ha?: string;
  dh?: string; dd?: string; da?: string;
  ah?: string; ad?: string; aa?: string;
  updateDate?: string; updateTime?: string;
}

interface RawSportteryMatch {
  matchId: number;
  matchNumStr?: string;
  matchNumDate?: string;
  taxDateNo?: string;
  leagueAbbName?: string;
  leagueAllName?: string;
  matchDate?: string;
  matchTime?: string;
  matchStatus?: string;
  homeTeamAbbName?: string;
  homeTeamAllName?: string;
  awayTeamAbbName?: string;
  awayTeamAllName?: string;
  had?: RawSportteryPoolOdds;
  hhad?: RawSportteryPoolOdds;
  ttg?: RawSportteryTTG;
  mnts?: RawSportteryMNTS;
  // 比分：key 格式 s{home}{away}（如 s10=1:0），特殊 sw/sd/sa=其他
  crs?: Record<string, string>;
}

function parseOdd(value: string | undefined): number | null {
  if (!value) return null;
  const odd = Number(value);
  return Number.isFinite(odd) && odd > 1 ? odd : null;
}

function updateAt(odds: RawSportteryPoolOdds | undefined): string | null {
  if (!odds?.updateDate || !odds.updateTime) return null;
  return `${odds.updateDate} ${odds.updateTime}`;
}

function buildRow(
  poolCode: "HAD" | "HHAD",
  poolName: "胜平负" | "让球胜平负",
  rawOdds: RawSportteryPoolOdds | undefined,
): SportteryOddsRow {
  const odds = [parseOdd(rawOdds?.h), parseOdd(rawOdds?.d), parseOdd(rawOdds?.a)];
  const implied = odds.every((odd) => odd !== null)
    ? impliedProbabilities(odds as number[])
    : null;
  const labels: Array<SportteryOutcome["label"]> = ["胜", "平", "负"];
  const keys: SportteryOutcomeKey[] = ["h", "d", "a"];

  return {
    poolCode,
    poolName,
    handicapLabel:
      poolCode === "HAD" ? "0" : rawOdds?.goalLine && rawOdds.goalLine !== "" ? rawOdds.goalLine : "未",
    updateAt: updateAt(rawOdds),
    outcomes: keys.map((key, index) => ({
      key,
      label: labels[index],
      odd: odds[index],
      probability: implied?.probs[index] ?? null,
    })),
  };
}

const TTG_KEYS: Array<keyof RawSportteryTTG> = ["s0","s1","s2","s3","s4","s5","s6","s7"];
const TTG_LABELS = ["0球","1球","2球","3球","4球","5球","6球","7+球"];

function buildTTGRow(raw: RawSportteryTTG | undefined): SportteryOddsRow | null {
  if (!raw) return null;
  const odds = TTG_KEYS.map((k) => parseOdd(raw[k] as string | undefined));
  if (!odds.some((o) => o !== null)) return null;
  const validOdds = odds.map((o) => o ?? null);
  const allValid = validOdds.every((o) => o !== null);
  const implied = allValid ? impliedProbabilities(validOdds as number[]) : null;
  return {
    poolCode: "TTG",
    poolName: "总进球",
    handicapLabel: "",
    updateAt: raw.updateDate && raw.updateTime ? `${raw.updateDate} ${raw.updateTime}` : null,
    outcomes: TTG_KEYS.map((k, i) => ({
      key: k,
      label: TTG_LABELS[i],
      odd: odds[i],
      probability: implied?.probs[i] ?? null,
    })),
  };
}

const MNTS_KEYS: Array<keyof RawSportteryMNTS> = ["hh","hd","ha","dh","dd","da","ah","ad","aa"];
const MNTS_LABELS = ["主/主","主/平","主/客","平/主","平/平","平/客","客/主","客/平","客/客"];

function buildMNTSRow(raw: RawSportteryMNTS | undefined): SportteryOddsRow | null {
  if (!raw) return null;
  const odds = MNTS_KEYS.map((k) => parseOdd(raw[k] as string | undefined));
  if (!odds.some((o) => o !== null)) return null;
  const allValid = odds.every((o) => o !== null);
  const implied = allValid ? impliedProbabilities(odds as number[]) : null;
  return {
    poolCode: "MNTS",
    poolName: "半全场",
    handicapLabel: "",
    updateAt: raw.updateDate && raw.updateTime ? `${raw.updateDate} ${raw.updateTime}` : null,
    outcomes: MNTS_KEYS.map((k, i) => ({
      key: k,
      label: MNTS_LABELS[i],
      odd: odds[i],
      probability: implied?.probs[i] ?? null,
    })),
  };
}

// 体彩 CRS key 格式：s{HH}s{AA} 或 s{HH}s{AA}f（"f"=其他）
// 例：s01s00 → 1:0，s00s01 → 0:1，s00s00f → 平局其他
function parseCrsKey(key: string): { home: number; away: number; other: boolean } | null {
  const m = key.match(/^s(\d{2})s(\d{2})(f?)$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]), other: m[3] === "f" };
}

function crsKeyToLabel(key: string): string {
  const p = parseCrsKey(key);
  if (!p) return key;
  const score = `${p.home}:${p.away}`;
  return p.other ? `${score}+` : score;
}

// 排序：先按主场进球数，再按客场进球数，"f"（其他）排到同组末尾
function crsSortKey(key: string): number {
  const p = parseCrsKey(key);
  if (!p) return 9999;
  return p.home * 1000 + p.away * 10 + (p.other ? 1 : 0);
}

function buildCRSRow(raw: Record<string, string> | undefined): SportteryOddsRow | null {
  if (!raw) return null;
  const entries = Object.entries(raw)
    .filter(([k]) => k !== "updateDate" && k !== "updateTime" && parseCrsKey(k) !== null)
    .sort(([a], [b]) => crsSortKey(a) - crsSortKey(b));
  if (entries.length === 0) return null;

  const odds = entries.map(([, v]) => parseOdd(v));
  if (!odds.some((o) => o !== null)) return null;

  const allValid = odds.every((o) => o !== null);
  const implied = allValid ? impliedProbabilities(odds as number[]) : null;

  return {
    poolCode: "CRS",
    poolName: "比分",
    handicapLabel: "",
    updateAt: raw.updateDate && raw.updateTime ? `${raw.updateDate} ${raw.updateTime}` : null,
    outcomes: entries.map(([k], i) => ({
      key: k,
      label: crsKeyToLabel(k),
      odd: odds[i],
      probability: implied?.probs[i] ?? null,
    })),
  };
}

function hasAnyOdds(row: SportteryOddsRow): boolean {
  return row.outcomes.some((outcome) => outcome.odd !== null);
}

function mapMatch(raw: RawSportteryMatch): SportteryMatch {
  const had = buildRow("HAD", "胜平负", raw.had);
  const hhad = buildRow("HHAD", "让球胜平负", raw.hhad);
  const ttg = buildTTGRow(raw.ttg);
  const mnts = buildMNTSRow(raw.mnts);
  const crs = buildCRSRow(raw.crs);

  return {
    matchId: raw.matchId,
    matchNum: raw.matchNumStr ?? String(raw.matchId),
    matchNumDate: raw.matchNumDate ?? "",
    taxDateNo: raw.taxDateNo ?? "",
    league: raw.leagueAbbName || raw.leagueAllName || "赛事",
    matchDate: raw.matchDate ?? "",
    matchTime: raw.matchTime ?? "",
    kickoffText: `${raw.matchDate ?? ""} ${(raw.matchTime ?? "").slice(0, 5)}`.trim(),
    home: raw.homeTeamAllName || raw.homeTeamAbbName || "主队",
    away: raw.awayTeamAllName || raw.awayTeamAbbName || "客队",
    status: raw.matchStatus ?? "",
    rows: [had, hhad, ttg, mnts, crs].filter((r): r is SportteryOddsRow => r !== null && hasAnyOdds(r)),
  };
}

/**
 * 解析竞彩官网原始响应为面板结构。与「抓取」解耦：
 * 阿里云 FC（国内 IP）抓到原始 JSON 后 POST 给 /api/odds/ingest，
 * 由本函数在我们自己的代码里解析，避免逻辑在云函数中重复。
 */
export function parseSportteryResponse(data: RawSportteryResponse): SportteryOddsPayload {
  if (data.errorCode !== "0" || !data.value) {
    throw new Error(data.errorMessage || "中国竞彩网赔率接口返回为空");
  }
  const days: SportteryMatchDay[] = (data.value.matchInfoList ?? [])
    .map((day) => ({
      businessDate: day.businessDate,
      matches: (day.subMatchList ?? []).map(mapMatch).filter((match) => match.rows.length > 0),
    }))
    .filter((day) => day.matches.length > 0);

  return {
    source: "中国竞彩网公开足球计算器",
    sourceUrl: "https://www.sporttery.cn/jc/jsq/zqhhgg/",
    lastUpdated: data.value.lastUpdateTime ?? null,
    days,
  };
}

export async function getSportteryFootballOdds(): Promise<SportteryOddsPayload> {
  const res = await fetch(SPORTTERY_ODDS_URL, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: "https://www.sporttery.cn/jc/jsq/zqhhgg/",
      Origin: "https://www.sporttery.cn",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`中国竞彩网赔率接口请求失败: ${res.status}`);
  }

  return parseSportteryResponse((await res.json()) as RawSportteryResponse);
}

export function emptySportteryPayload(error?: string): SportteryOddsPayload {
  return {
    source: "中国竞彩网公开足球计算器",
    sourceUrl: "https://www.sporttery.cn/jc/jsq/zqhhgg/",
    lastUpdated: null,
    days: [],
    error,
  };
}
