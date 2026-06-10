/**
 * football-data.org v4 客户端（规格文档 4.1）
 * 免费档限频 10 请求/分钟：所有请求走 Next.js fetch 缓存（60s 重验证），
 * 页面流量不会穿透到上游 API。
 */

const BASE = "https://api.football-data.org/v4";

export interface FdTeam {
  id: number | null;
  name: string | null;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}

export type FdMatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export interface FdMatch {
  id: number;
  utcDate: string;
  status: FdMatchStatus;
  matchday: number | null;
  stage: string;
  group: string | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}

async function fdFetch<T>(path: string, revalidate = 60): Promise<T> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("缺少 FOOTBALL_DATA_TOKEN 环境变量");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token },
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`football-data ${path} 请求失败: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** 世界杯全部赛程（含比分），缓存 60s */
export async function getWorldCupMatches(): Promise<FdMatch[]> {
  const data = await fdFetch<{ matches: FdMatch[] }>(
    "/competitions/WC/matches",
  );
  return data.matches;
}

/* ---------- 展示用映射 ---------- */

export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "小组赛",
  LAST_32: "1/16 决赛",
  LAST_16: "1/8 决赛",
  QUARTER_FINALS: "1/4 决赛",
  SEMI_FINALS: "半决赛",
  THIRD_PLACE: "季军赛",
  FINAL: "决赛",
};

export const STATUS_LABELS: Record<FdMatchStatus, string> = {
  SCHEDULED: "未开赛",
  TIMED: "未开赛",
  IN_PLAY: "进行中",
  PAUSED: "中场",
  FINISHED: "完赛",
  SUSPENDED: "中断",
  POSTPONED: "延期",
  CANCELLED: "取消",
  AWARDED: "判胜",
};

/** "GROUP_A" → "A组" */
export function groupLabel(group: string | null): string | null {
  if (!group) return null;
  return group.replace("GROUP_", "") + "组";
}
