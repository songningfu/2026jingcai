"use client";

import { useEffect, useRef } from "react";
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

/** 首页横向比赛速览：自动向左滚动，鼠标悬停暂停 */
export default function MatchTicker({ matches }: { matches: TickerMatch[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const SPEED = 0.6; // px per frame
    const step = () => {
      if (!pausedRef.current && track) {
        track.scrollLeft += SPEED;
        // 无缝循环：滚到一半就跳回来（内容已复制一遍）
        if (track.scrollLeft >= track.scrollWidth / 2) {
          track.scrollLeft = 0;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (matches.length === 0) return null;
  const doubled = [...matches, ...matches]; // 无缝循环复制

  return (
    <div
      className="relative -mx-4"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={() => { pausedRef.current = true; }}
      onTouchEnd={() => { pausedRef.current = false; }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-pitch to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-pitch to-transparent" />
      <div ref={trackRef} className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2" style={{ cursor: "default" }}>
      {doubled.map((m, idx) => {
        const live = m.status === "live";
        const finished = m.status === "finished";
        return (
          <Link
            key={`${m.id}-${idx}`}
            href={`/match/${m.id}`}
            className="card shrink-0 px-3 py-2.5 transition hover:border-neon/50"
            style={{ minWidth: "9.5rem" }}
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
