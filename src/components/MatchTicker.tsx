"use client";

import Link from "next/link";

export interface TickerMatch {
  id: number;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoff: string;
  group: string | null;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
}

const dayTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 首页横向比赛滚动条：所有比赛对阵一览，可点进详情 */
export default function MatchTicker({ matches }: { matches: TickerMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {matches.map((m) => {
        const live = m.status === "live";
        const finished = m.status === "finished";
        return (
          <Link
            key={m.id}
            href={`/match/${m.id}`}
            className="card shrink-0 px-4 py-3 transition hover:border-neon/50"
            style={{ minWidth: "11rem" }}
          >
            <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
              <span>{dayTimeFmt.format(new Date(m.kickoff))}</span>
              {live ? (
                <span className="flex items-center gap-1 text-live">
                  <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-live" />
                  进行中
                </span>
              ) : (
                <span>{m.group ? `${m.group}组` : finished ? "完赛" : ""}</span>
              )}
            </div>
            <TickerTeam name={m.home} logo={m.homeLogo} score={finished || live ? m.homeScore : null} />
            <TickerTeam name={m.away} logo={m.awayLogo} score={finished || live ? m.awayScore : null} live={live} />
          </Link>
        );
      })}
    </div>
  );
}

function TickerTeam({
  name,
  logo,
  score,
  live,
}: {
  name: string;
  logo: string | null;
  score: number | null;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-full bg-raised" />
      )}
      <span className="flex-1 truncate text-sm text-ink">{name}</span>
      {score !== null && (
        <span className={`font-num text-sm font-bold tabular-nums ${live ? "text-live" : "text-ink"}`}>
          {score}
        </span>
      )}
    </div>
  );
}
