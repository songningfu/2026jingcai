import "server-only";

/**
 * 竞彩官方接口的境外降级源：webapi.sporttery.cn 拒绝境外 IP（如 Vercel 机房），
 * 此时改用 Supabase odds 表中已采集的赔率拼装同结构的面板数据。
 * 数据由境内环境（本地机器/国内服务器）定时调用 /api/odds/sync 写入。
 */
import { impliedProbabilities } from "./odds";
import { supabaseAdmin } from "./supabase";
import type {
  SportteryMatch,
  SportteryMatchDay,
  SportteryOddsPayload,
  SportteryOddsRow,
} from "./sporttery-types";

const OUTCOME_ORDER: { key: string; label: "胜" | "平" | "负"; db: string }[] = [
  { key: "h", label: "胜", db: "主胜" },
  { key: "d", label: "平", db: "平" },
  { key: "a", label: "负", db: "客胜" },
];

const TTG_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];
const TTG_LABELS = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];

function crsKeyToLabel(key: string): string {
  const m = key.match(/^s(\d{2})s(\d{2})(f?)$/);
  if (!m) return key;
  const score = `${Number(m[1])}:${Number(m[2])}`;
  return m[3] === "f" ? `${score}+` : score;
}

function crsSortKey(key: string): number {
  const m = key.match(/^s(\d{2})s(\d{2})(f?)$/);
  if (!m) return 9999;
  return Number(m[1]) * 1000 + Number(m[2]) * 10 + (m[3] === "f" ? 1 : 0);
}

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface DbOdds {
  match_id: number;
  play_type: string;
  handicap: number | null;
  outcome: string;
  odd: number;
  captured_at: string;
}
interface DbTeamRef {
  name_zh?: string | null;
}
interface DbMatch {
  id: number;
  kickoff_at: string;
  status: string | null;
  home: DbTeamRef | DbTeamRef[] | null;
  away: DbTeamRef | DbTeamRef[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function buildRow(
  poolCode: "HAD" | "HHAD",
  poolName: "胜平负" | "让球胜平负",
  handicapLabel: string,
  updateAt: string | null,
  byOutcome: Map<string, number>,
): SportteryOddsRow | null {
  const odds = OUTCOME_ORDER.map((o) => byOutcome.get(o.db));
  if (odds.some((o) => o === undefined)) return null;
  const implied = impliedProbabilities(odds as number[]);
  return {
    poolCode,
    poolName,
    handicapLabel,
    updateAt,
    outcomes: OUTCOME_ORDER.map((o, i) => ({
      key: o.key,
      label: o.label,
      odd: (odds as number[])[i],
      probability: implied ? implied.probs[i] : null,
    })),
  };
}

/** 从 Supabase 拼装赔率面板（仅未完赛、且有赔率的场次） */
export async function getOddsBoardFromDb(): Promise<SportteryOddsPayload> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();

  const [matchesRes, oddsRes] = await Promise.all([
    db
      .from("matches")
      .select(
        "id, kickoff_at, status, home:teams!matches_home_team_id_fkey(name_zh), away:teams!matches_away_team_id_fkey(name_zh)",
      )
      .gte("kickoff_at", since)
      .order("kickoff_at")
      .limit(40),
    db
      .from("odds")
      .select("match_id, play_type, handicap, outcome, odd, captured_at")
      .order("captured_at", { ascending: false })
      .limit(3000),
  ]);

  const oddsByMatch = new Map<number, DbOdds[]>();
  for (const row of (oddsRes.data ?? []) as DbOdds[]) {
    const list = oddsByMatch.get(row.match_id) ?? [];
    list.push(row);
    oddsByMatch.set(row.match_id, list);
  }

  const dayMap = new Map<string, SportteryMatch[]>();
  let lastCaptured: string | null = null;

  for (const m of (matchesRes.data ?? []) as DbMatch[]) {
    const rows = oddsByMatch.get(m.id);
    if (!rows || rows.length === 0) continue;

    // 各玩法取最新一组
    const latest = (playType: string) => {
      const map = new Map<string, number>();
      let updateAt: string | null = null;
      let handicap: number | null = null;
      for (const r of rows) {
        if (r.play_type !== playType) continue;
        if (!map.has(r.outcome)) {
          map.set(r.outcome, Number(r.odd));
          updateAt = updateAt ?? r.captured_at;
          handicap = handicap ?? r.handicap;
        }
      }
      return { map, updateAt, handicap };
    };

    const whl = latest("whl");
    const hhad = latest("handicap");
    const ttgData = latest("totalgoals");
    const crsData = latest("score");
    const builtRows: SportteryOddsRow[] = [];

    const whlRow = buildRow("HAD", "胜平负", "0", whl.updateAt, whl.map);
    if (whlRow) builtRows.push(whlRow);
    const hhadRow = buildRow("HHAD", "让球胜平负", String(hhad.handicap ?? 0), hhad.updateAt, hhad.map);
    if (hhadRow) builtRows.push(hhadRow);

    // 总进球（TTG）
    if (ttgData.map.size > 0) {
      const ttgOutcomes = TTG_LABELS
        .map((label, i) => ({ key: TTG_KEYS[i], label, odd: ttgData.map.get(label) ?? null }))
        .filter((o): o is { key: string; label: string; odd: number } => o.odd !== null);
      if (ttgOutcomes.length >= 2) {
        const implied = impliedProbabilities(ttgOutcomes.map((o) => o.odd));
        builtRows.push({
          poolCode: "TTG",
          poolName: "总进球",
          handicapLabel: "",
          updateAt: ttgData.updateAt,
          outcomes: ttgOutcomes.map((o, i) => ({ ...o, probability: implied?.probs[i] ?? null })),
        });
      }
    }

    // 比分（CRS）：key 格式 s01s00，label 由 key 推导
    if (crsData.map.size > 0) {
      const crsOutcomes = [...crsData.map.entries()]
        .sort(([a], [b]) => crsSortKey(a) - crsSortKey(b))
        .map(([key, odd]) => ({ key, label: crsKeyToLabel(key), odd, probability: null as number | null }));
      if (crsOutcomes.length >= 2) {
        const implied = impliedProbabilities(crsOutcomes.map((o) => o.odd));
        builtRows.push({
          poolCode: "CRS",
          poolName: "比分",
          handicapLabel: "",
          updateAt: crsData.updateAt,
          outcomes: crsOutcomes.map((o, i) => ({ ...o, probability: implied?.probs[i] ?? null })),
        });
      }
    }

    if (builtRows.length === 0) continue;

    if (whl.updateAt && (!lastCaptured || whl.updateAt > lastCaptured)) {
      lastCaptured = whl.updateAt;
    }

    const kickoff = new Date(m.kickoff_at);
    const dayKey = dayKeyFmt.format(kickoff);
    const home = one(m.home)?.name_zh ?? "待定";
    const away = one(m.away)?.name_zh ?? "待定";

    const match: SportteryMatch = {
      matchId: m.id,
      matchNum: `周${WEEKDAY_ZH[Number(new Date(`${dayKey}T12:00:00+08:00`).getDay())]}`,
      matchNumDate: dayKey,
      taxDateNo: dayKey,
      league: "世界杯",
      matchDate: dayKey,
      matchTime: timeFmt.format(kickoff) + ":00",
      kickoffText: `${dayKey} ${timeFmt.format(kickoff)}`,
      home,
      away,
      status: "官方采集缓存",
      rows: builtRows,
    };
    const list = dayMap.get(dayKey) ?? [];
    list.push(match);
    dayMap.set(dayKey, list);
  }

  const days: SportteryMatchDay[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([businessDate, matches]) => ({ businessDate, matches }));

  return {
    source: "中国竞彩网官方赔率（本站定时采集缓存）",
    sourceUrl: "https://www.sporttery.cn/jc/jsq/zqhhgg/",
    lastUpdated: lastCaptured
      ? new Date(lastCaptured).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
        })
      : null,
    days,
    error:
      days.length === 0
        ? "官方接口与缓存均暂不可用，请稍后再试。"
        : undefined,
  };
}
