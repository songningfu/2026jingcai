import type { Metadata } from "next";
import Link from "next/link";
import {
  getWorldCupMatches,
  groupLabel,
  STAGE_LABELS,
  STATUS_LABELS,
  type FdMatch,
} from "@/lib/football-data";
import { ANALYSIS_MODES } from "@/lib/analysis-modes";
import { supabaseAdmin } from "@/lib/supabase";
import { teamNameZh } from "@/lib/team-names";

export const metadata: Metadata = {
  title: "世界杯赛程",
  description:
    "2026 世界杯完整赛程：104 场比赛的对阵、开球时间（北京时间）、实时比分、官方赔率与赛果。",
};

export const revalidate = 60;

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

type WhlOdds = { 主胜?: number; 平?: number; 客胜?: number };

/** 每场最新一组胜平负官方赔率 */
async function getLatestWhlOdds(): Promise<Map<number, WhlOdds>> {
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("odds")
      .select("match_id, outcome, odd, captured_at")
      .eq("play_type", "whl")
      .order("captured_at", { ascending: false })
      .limit(600);
    const map = new Map<number, WhlOdds>();
    for (const row of data ?? []) {
      const entry = map.get(row.match_id) ?? {};
      const key = row.outcome as keyof WhlOdds;
      if (entry[key] === undefined) entry[key] = Number(row.odd);
      map.set(row.match_id, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

function TeamCell({ team, align }: { team: FdMatch["homeTeam"]; align: "right" | "left" }) {
  const name = teamNameZh(team.name);
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      {align === "left" && team.crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="h-4 w-4 shrink-0 object-contain sm:h-5 sm:w-5" />
      )}
      <span
        className={`truncate whitespace-nowrap text-[13px] sm:text-sm ${name === "待定" ? "text-faint" : "text-ink"}`}
      >
        {name}
      </span>
      {align === "right" && team.crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="h-4 w-4 shrink-0 object-contain sm:h-5 sm:w-5" />
      )}
    </div>
  );
}

function MatchRow({ match, odds }: { match: FdMatch; odds?: WhlOdds }) {
  const live = match.status === "IN_PLAY" || match.status === "PAUSED";
  const finished = match.status === "FINISHED" || match.status === "AWARDED";
  const ft = match.score.fullTime;
  const ht = match.score.halfTime;
  const label =
    match.stage === "GROUP_STAGE"
      ? groupLabel(match.group)
      : (STAGE_LABELS[match.stage] ?? match.stage);
  const hasOdds = odds && odds.主胜 && odds.平 && odds.客胜;

  return (
    <div className="border-t border-line px-4 py-3">
      <Link
        href={`/match/${match.id}`}
        className="grid grid-cols-[2.6rem_minmax(0,1fr)_3.4rem_minmax(0,1fr)_3.4rem] items-center gap-1.5 text-sm transition sm:grid-cols-[3.2rem_1fr_5.5rem_1fr_4rem] sm:gap-2"
      >
        <span className="font-num tabular-nums text-mut">
          {timeFmt.format(new Date(match.utcDate))}
        </span>
        <TeamCell team={match.homeTeam} align="right" />
        <div className="text-center">
          {finished || live ? (
            <div>
              <span
                className={`font-num text-xl font-bold tabular-nums ${live ? "text-live" : "text-ink"}`}
              >
                {ft.home ?? 0}–{ft.away ?? 0}
              </span>
              {finished && ht.home !== null && (
                <span className="font-num block text-[10px] text-faint">
                  半场 {ht.home}–{ht.away}
                </span>
              )}
            </div>
          ) : (
            <span className="font-num text-faint">VS</span>
          )}
        </div>
        <TeamCell team={match.awayTeam} align="left" />
        <div className="text-right">
          <span
            className={`chip !px-1.5 !text-[10px] sm:!px-2.5 sm:!text-xs ${
              live
                ? "border-live/30 bg-live/10 text-live"
                : finished
                  ? ""
                  : "border-neon/20 bg-neon/5 text-neon"
            }`}
          >
            {live ? "进行中" : (label ?? STATUS_LABELS[match.status])}
          </span>
        </div>
      </Link>
      {/* 官方赔率一行（在售场次才有） */}
      {hasOdds && !finished && (
        <div className="mt-2 grid grid-cols-[2.6rem_1fr_3.4rem] items-center gap-1.5 sm:grid-cols-[3.2rem_1fr_4rem] sm:gap-2">
          <span className="font-num text-[10px] tracking-widest text-faint">竞彩</span>
          <div className="font-num flex justify-center gap-4 text-xs tabular-nums text-amber">
            <span>胜 {odds.主胜!.toFixed(2)}</span>
            <span>平 {odds.平!.toFixed(2)}</span>
            <span>负 {odds.客胜!.toFixed(2)}</span>
          </div>
          <span />
        </div>
      )}
      {/* 两种 AI 分析模式入口 */}
      {!finished && (
        <div className="mt-2.5 flex gap-2">
          {Object.values(ANALYSIS_MODES).map((mode) => (
            <Link
              key={mode.key}
              href={`/match/${match.id}#ai`}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                mode.free
                  ? "bg-neon/10 text-neon hover:bg-neon/15"
                  : "border border-amber/30 bg-amber/5 text-amber hover:bg-amber/10"
              }`}
            >
              <span aria-hidden>{mode.icon}</span>
              {mode.name}
              {!mode.free && <span className="text-[10px] opacity-70">· 订阅</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "group", label: "小组赛" },
  { key: "knockout", label: "淘汰赛" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filter: FilterKey = (FILTERS.find((x) => x.key === f)?.key ?? "all") as FilterKey;

  const [matches, oddsMap] = await Promise.all([getWorldCupMatches(), getLatestWhlOdds()]);
  matches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  const todayKey = dayKeyFmt.format(new Date());

  const filtered = matches.filter((m) => {
    if (filter === "today") return dayKeyFmt.format(new Date(m.utcDate)) === todayKey;
    if (filter === "group") return m.stage === "GROUP_STAGE";
    if (filter === "knockout") return m.stage !== "GROUP_STAGE";
    return true;
  });

  const byDay = new Map<string, FdMatch[]>();
  for (const m of filtered) {
    const key = dayKeyFmt.format(new Date(m.utcDate));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">世界杯赛程</h1>
      <p className="mt-1 text-sm text-mut">
        共 {matches.length} 场 · 北京时间 · 比分每分钟更新 · 琥珀色为竞彩官方在售赔率
      </p>

      <div className="mt-5 flex gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/matches" : `/matches?f=${x.key}`}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              filter === x.key
                ? "bg-neon font-medium text-white"
                : "bg-surface text-mut ring-1 ring-line hover:ring-neon/40"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card mt-6 border-dashed px-4 py-12 text-center text-sm text-mut">
          {filter === "today" ? "今天没有比赛，看看其他日期吧。" : "暂无符合条件的比赛。"}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {[...byDay.entries()].map(([day, dayMatches]) => {
          const isToday = day === todayKey;
          const stage = dayMatches[0].stage;
          return (
            <section key={day} id={isToday ? "today" : undefined}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-mut">
                {dateFmt.format(new Date(dayMatches[0].utcDate))}
                {isToday && (
                  <span className="rounded-full bg-neon px-2 py-0.5 text-xs font-medium text-pitch">
                    今天
                  </span>
                )}
                <span className="font-normal text-faint">{STAGE_LABELS[stage] ?? stage}</span>
              </h2>
              <div
                className={`card overflow-hidden ${isToday ? "border-neon/40" : ""}`}
              >
                {dayMatches.map((m) => (
                  <MatchRow key={m.id} match={m} odds={oddsMap.get(m.id)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-faint">
        赛程比分来源 football-data.org · 赔率来源中国竞彩网公开数据 · 均可能存在延迟，以官方为准
      </p>
    </div>
  );
}
