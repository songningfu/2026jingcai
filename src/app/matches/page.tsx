import type { Metadata } from "next";
import Link from "next/link";
import LiveRefresher from "./LiveRefresher";
import {
  getWorldCupMatches,
  getStandings,
  groupLabel,
  STAGE_LABELS,
  STATUS_LABELS,
  type FdMatch,
  type FdStandingRow,
} from "@/lib/football-data";
import { teamNameZh } from "@/lib/team-names";

export const metadata: Metadata = {
  title: "世界杯赛程",
  description:
    "2026 世界杯完整赛程：104 场比赛的对阵、开球时间（北京时间）、实时比分与赛果。",
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

function isProbablyFinished(match: FdMatch) {
  const kickoff = new Date(match.utcDate).getTime();
  const elapsedMinutes = (Date.now() - kickoff) / 60_000;
  const hasScore = match.score.fullTime.home !== null && match.score.fullTime.away !== null;

  // 上游状态偶尔会延迟从 IN_PLAY/PAUSED 切到 FINISHED。
  // 超过 130 分钟且已有比分时，页面先按完赛展示，避免赛程卡在“进行中”。
  return hasScore && elapsedMinutes > 130;
}

function MatchRow({ match }: { match: FdMatch }) {
  const rawLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const finished = match.status === "FINISHED" || match.status === "AWARDED" || (rawLive && isProbablyFinished(match));
  const live = rawLive && !finished;
  const ft = match.score.fullTime;
  const ht = match.score.halfTime;
  const label =
    match.stage === "GROUP_STAGE"
      ? groupLabel(match.group)
      : (STAGE_LABELS[match.stage] ?? match.stage);

  return (
    <div className="border-t border-line px-3 py-3 sm:px-4">
      <Link
        href={`/match/${match.id}`}
        className="grid grid-cols-[2.4rem_minmax(0,1fr)_3.2rem_minmax(0,1fr)_3.2rem] items-center gap-1 text-sm transition active:opacity-70 sm:grid-cols-[3.2rem_1fr_5.5rem_1fr_4rem] sm:gap-2"
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
      {!finished && (
        <div className="mt-3 flex flex-wrap justify-center gap-2.5">
          {[
            { label: "球队信息", href: `/match/${match.id}` },
            { label: "深度推演", href: `/deduction` },
          ].map((btn) => (
            <Link
              key={btn.label}
              href={btn.href}
              className="flex min-w-[6.25rem] items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-mut transition hover:border-neon/30 hover:text-ink"
            >
              {btn.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** 小组积分榜 */
function GroupStandingsTable({ rows }: { rows: FdStandingRow[] }) {
  return (
    <div className="mb-3 overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-3.5 w-1 rounded-full bg-neon" />
        <span className="text-sm font-semibold text-ink">积分榜</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-faint">
            <th className="py-2 pl-4 pr-2 text-left font-normal">排名</th>
            <th className="py-2 pr-3 text-left font-normal">球队</th>
            <th className="py-2 pr-3 text-right font-normal tabular-nums">赛</th>
            <th className="py-2 pr-3 text-right font-normal tabular-nums">胜/平/负</th>
            <th className="py-2 pr-3 text-right font-normal tabular-nums">净胜</th>
            <th className="py-2 pr-4 text-right font-bold tabular-nums">积分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const name = teamNameZh(r.team.name);
            const qualify = i < 2;
            return (
              <tr key={r.team.id} className={`border-t border-line/50 ${qualify ? "" : ""}`}>
                <td className="py-2.5 pl-4 pr-2 text-mut">{r.position}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    {r.team.crest && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.team.crest} alt="" className="h-4 w-4 object-contain" />
                    )}
                    <span className={`font-semibold ${qualify ? "text-ink" : "text-mut"}`}>{name}</span>
                  </div>
                </td>
                <td className="font-num py-2.5 pr-3 text-right tabular-nums text-mut">{r.playedGames}</td>
                <td className="font-num py-2.5 pr-3 text-right tabular-nums text-mut">
                  {r.won}/{r.draw}/{r.lost}
                </td>
                <td className="font-num py-2.5 pr-3 text-right tabular-nums text-mut">
                  {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                </td>
                <td className="font-num py-2.5 pr-4 text-right font-bold tabular-nums text-ink">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-faint">每组前两名直接晋级，8 个成绩最好的第三名递补进 32 强。</p>
    </div>
  );
}

/** 淘汰赛对阵卡（卡片形式，两队竖排） */
function KnockoutMatchCard({ match }: { match: FdMatch }) {
  const live = match.status === "IN_PLAY" || match.status === "PAUSED";
  const finished = match.status === "FINISHED" || match.status === "AWARDED";
  const ft = match.score.fullTime;
  const home = teamNameZh(match.homeTeam.name);
  const away = teamNameZh(match.awayTeam.name);

  return (
    <Link
      href={`/match/${match.id}`}
      className="card flex flex-col items-center gap-2 p-4 text-center transition hover:border-neon/30"
    >
      <span className="font-num text-xs text-faint">
        {timeFmt.format(new Date(match.utcDate))}
      </span>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex flex-1 flex-col items-center gap-1">
          {match.homeTeam.crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.homeTeam.crest} alt="" className="h-8 w-8 object-contain" />
          )}
          <span className={`text-xs font-semibold ${home === "待定" ? "text-faint" : "text-ink"}`}>
            {home}
          </span>
        </div>
        <div className="font-num flex min-w-[3rem] flex-col items-center">
          {finished || live ? (
            <>
              <span className={`text-xl font-bold tabular-nums ${live ? "text-live" : "text-ink"}`}>
                {ft.home ?? 0}–{ft.away ?? 0}
              </span>
              {live && <span className="text-[10px] text-live">进行中</span>}
            </>
          ) : (
            <span className="text-sm text-faint">VS</span>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center gap-1">
          {match.awayTeam.crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.awayTeam.crest} alt="" className="h-8 w-8 object-contain" />
          )}
          <span className={`text-xs font-semibold ${away === "待定" ? "text-faint" : "text-ink"}`}>
            {away}
          </span>
        </div>
      </div>
    </Link>
  );
}

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "group", label: "小组赛" },
  { key: "knockout", label: "淘汰赛" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const KNOCKOUT_ORDER = [
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filter: FilterKey = (FILTERS.find((x) => x.key === f)?.key ?? "all") as FilterKey;

  const [matches, standingsMap] = await Promise.all([getWorldCupMatches(), getStandings()]);
  const hasLive = matches.some(
    (m) => (m.status === "IN_PLAY" || m.status === "PAUSED") && !isProbablyFinished(m),
  );
  matches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  const todayKey = dayKeyFmt.format(new Date());

  const filtered = matches.filter((m) => {
    if (filter === "today") return dayKeyFmt.format(new Date(m.utcDate)) === todayKey;
    if (filter === "group") return m.stage === "GROUP_STAGE";
    if (filter === "knockout") return m.stage !== "GROUP_STAGE";
    return true;
  });

  /* 按日期分组（全部 / 今天 视图复用） */
  const byDay = new Map<string, FdMatch[]>();
  if (filter === "all" || filter === "today") {
    for (const m of filtered) {
      const key = dayKeyFmt.format(new Date(m.utcDate));
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(m);
    }
  }

  /* 按小组分组 */
  const byGroup = new Map<string, FdMatch[]>();
  if (filter === "group") {
    for (const m of filtered) {
      const key = m.group ?? "未分组";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(m);
    }
  }

  /* 按淘汰赛轮次分组 */
  const byStage = new Map<string, FdMatch[]>();
  if (filter === "knockout") {
    for (const m of filtered) {
      if (!byStage.has(m.stage)) byStage.set(m.stage, []);
      byStage.get(m.stage)!.push(m);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <LiveRefresher hasLive={hasLive} />
      <h1 className="text-2xl font-bold text-ink">世界杯赛程</h1>
      <p className="mt-1 text-sm text-mut">
        共 {matches.length} 场 · 北京时间 · 比分每分钟更新
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/matches" : `/matches?f=${x.key}`}
            className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm leading-none transition sm:min-h-0 sm:min-w-0 ${
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

      {/* 全部 / 今天：按日期分组列表 */}
      {(filter === "all" || filter === "today") && byDay.size > 0 && (
        <div className="mt-6 space-y-6">
          {[...byDay.entries()].map(([day, dayMatches]) => {
            const isToday = day === todayKey;
            const stage = dayMatches[0].stage;
            return (
              <section key={day} id={isToday ? "today" : undefined}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-mut">
                  {dateFmt.format(new Date(dayMatches[0].utcDate))}
                  <span className="font-normal text-faint">{STAGE_LABELS[stage] ?? stage}</span>
                </h2>
                <div className="card overflow-hidden">
                  {dayMatches.map((m) => (
                    <MatchRow key={m.id} match={m} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 小组赛：按组分类（A组、B组…） */}
      {filter === "group" && byGroup.size > 0 && (
        <div className="mt-6 space-y-6">
          {[...byGroup.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([groupKey, groupMatches]) => {
              const standings = standingsMap.get(groupKey);
              return (
                <section key={groupKey}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-mut">
                    <span className="rounded bg-neon/10 px-2 py-0.5 text-neon font-bold">
                      {groupLabel(groupKey) ?? groupKey}
                    </span>
                    <span className="font-normal text-faint">{groupMatches.length} 场</span>
                  </h2>
                  {standings ? (
                    <GroupStandingsTable rows={standings} />
                  ) : (
                    <div className="card overflow-hidden">
                      {groupMatches.map((m) => (
                        <MatchRow key={m.id} match={m} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      )}

      {/* 淘汰赛：按轮次展示对阵卡 */}
      {filter === "knockout" && byStage.size > 0 && (
        <div className="mt-6 space-y-8">
          {[
            ...KNOCKOUT_ORDER.filter((s) => byStage.has(s)),
            ...[...byStage.keys()].filter((s) => !KNOCKOUT_ORDER.includes(s)),
          ].map((stage) => {
            const stageMatches = byStage.get(stage)!;
            return (
              <section key={stage}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-mut">
                  <span className="rounded bg-amber/10 px-2 py-0.5 text-amber font-bold">
                    {STAGE_LABELS[stage] ?? stage}
                  </span>
                  <span className="font-normal text-faint">{stageMatches.length} 场</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {stageMatches.map((m) => (
                    <KnockoutMatchCard key={m.id} match={m} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-faint">
        赛程比分来源 football-data.org · 均可能存在延迟，以官方为准
      </p>
    </div>
  );
}
