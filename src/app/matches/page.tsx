import type { Metadata } from "next";
import Link from "next/link";
import {
  getWorldCupMatches,
  groupLabel,
  STAGE_LABELS,
  STATUS_LABELS,
  type FdMatch,
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
/** 北京时间的 YYYY-MM-DD，用于分组与「今天」高亮 */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
});

function TeamCell({
  team,
  align,
}: {
  team: FdMatch["homeTeam"];
  align: "right" | "left";
}) {
  const name = teamNameZh(team.name);
  return (
    <div
      className={`flex items-center gap-2 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {align === "left" && team.crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="h-5 w-5 object-contain" />
      )}
      <span className={name === "待定" ? "text-neutral-400" : ""}>{name}</span>
      {align === "right" && team.crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="h-5 w-5 object-contain" />
      )}
    </div>
  );
}

function MatchRow({ match }: { match: FdMatch }) {
  const live = match.status === "IN_PLAY" || match.status === "PAUSED";
  const finished = match.status === "FINISHED" || match.status === "AWARDED";
  const ft = match.score.fullTime;
  const label =
    match.stage === "GROUP_STAGE"
      ? groupLabel(match.group)
      : STAGE_LABELS[match.stage] ?? match.stage;

  return (
    <Link
      href={`/match/${match.id}`}
      className="grid grid-cols-[3.5rem_1fr_5rem_1fr_4rem] items-center gap-2 border-t border-neutral-100 px-4 py-3 text-sm transition hover:bg-emerald-50/50"
    >
      <span className="tabular-nums text-neutral-500">
        {timeFmt.format(new Date(match.utcDate))}
      </span>
      <TeamCell team={match.homeTeam} align="right" />
      <div className="text-center">
        {finished || live ? (
          <span
            className={`tabular-nums font-semibold ${
              live ? "text-red-600" : ""
            }`}
          >
            {ft.home ?? 0} - {ft.away ?? 0}
          </span>
        ) : (
          <span className="text-neutral-300">VS</span>
        )}
      </div>
      <TeamCell team={match.awayTeam} align="left" />
      <div className="text-right">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
            live
              ? "bg-red-50 text-red-600"
              : finished
                ? "bg-neutral-100 text-neutral-500"
                : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {label ?? STATUS_LABELS[match.status]}
        </span>
      </div>
    </Link>
  );
}

export default async function MatchesPage() {
  const matches = await getWorldCupMatches();
  matches.sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
  );

  const byDay = new Map<string, FdMatch[]>();
  for (const m of matches) {
    const key = dayKeyFmt.format(new Date(m.utcDate));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }
  const todayKey = dayKeyFmt.format(new Date());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">世界杯赛程</h1>
      <p className="mt-1 text-sm text-neutral-500">
        共 {matches.length} 场 · 时间均为北京时间 · 比分每分钟自动更新
      </p>

      <div className="mt-6 space-y-6">
        {[...byDay.entries()].map(([day, dayMatches]) => {
          const isToday = day === todayKey;
          const stage = dayMatches[0].stage;
          return (
            <section key={day} id={isToday ? "today" : undefined}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                {dateFmt.format(new Date(dayMatches[0].utcDate))}
                {isToday && (
                  <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-normal text-white">
                    今天
                  </span>
                )}
                <span className="font-normal text-neutral-400">
                  {STAGE_LABELS[stage] ?? stage}
                </span>
              </h2>
              <div
                className={`overflow-hidden rounded-xl border bg-white ${
                  isToday ? "border-emerald-300" : "border-neutral-200"
                }`}
              >
                {dayMatches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-neutral-400">
        数据来源：football-data.org · 比分可能存在延迟，以官方为准
      </p>
    </div>
  );
}
