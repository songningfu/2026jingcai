import "server-only";

import { impliedProbabilities } from "./odds";
import type {
  SportteryMatch,
  SportteryMatchDay,
  SportteryOddsPayload,
  SportteryOddsRow,
  SportteryOutcome,
  SportteryOutcomeKey,
} from "./sporttery-types";

const SPORTTERY_ODDS_URL =
  "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c&poolCode=had,hhad";

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

function hasAnyOdds(row: SportteryOddsRow): boolean {
  return row.outcomes.some((outcome) => outcome.odd !== null);
}

function mapMatch(raw: RawSportteryMatch): SportteryMatch {
  const had = buildRow("HAD", "胜平负", raw.had);
  const hhad = buildRow("HHAD", "让球胜平负", raw.hhad);

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
    rows: [had, hhad].filter(hasAnyOdds),
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
