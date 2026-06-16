import Link from "next/link";
import Countdown from "@/components/Countdown";
import MatchTicker, { type TickerMatch } from "@/components/MatchTicker";
import HomeFeed from "@/components/HomeFeed";
import { getWorldCupMatches, type FdMatchStatus } from "@/lib/football-data";
import { teamNameZh } from "@/lib/team-names";

export const revalidate = 60;

function mapStatus(s: FdMatchStatus): TickerMatch["status"] {
  if (s === "IN_PLAY" || s === "PAUSED") return "live";
  if (s === "FINISHED" || s === "AWARDED") return "finished";
  return "scheduled";
}

export default async function Home() {
  const matches = await getWorldCupMatches().catch(() => []);
  const sorted = matches
    .slice()
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  const upcoming = sorted.filter((m) => m.status !== "FINISHED" && m.status !== "AWARDED");
  const next = upcoming.find((m) => m.status === "TIMED" || m.status === "SCHEDULED");

  const ticker: TickerMatch[] = upcoming.slice(0, 20).map((m) => ({
    id: m.id,
    home: teamNameZh(m.homeTeam.name),
    away: teamNameZh(m.awayTeam.name),
    homeLogo: m.homeTeam.crest,
    awayLogo: m.awayTeam.crest,
    kickoff: m.utcDate,
    group: m.group ? m.group.replace("GROUP_", "") : null,
    status: mapStatus(m.status),
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 赛程速览 —— 置顶 */}
      {ticker.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-mut">
              <span className="anim-pulse-dot h-2 w-2 rounded-full bg-neon" />
              赛程速览
            </h2>
            <Link href="/matches" className="text-xs text-neon hover:underline">完整赛程 →</Link>
          </div>
          <MatchTicker matches={ticker} />
        </section>
      )}

      {/* Hero */}
      <section className="card anim-fade-up relative overflow-hidden px-7 py-10 sm:px-10">
        <svg
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 text-neon/10"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="100" cy="100" r="60" />
          <circle cx="100" cy="100" r="4" fill="currentColor" />
          <line x1="0" y1="100" x2="200" y2="100" />
          <circle cx="100" cy="100" r="95" />
        </svg>
        <p className="font-num text-xs font-semibold tracking-[0.3em] text-neon">
          FIFA WORLD CUP 2026 · 48 TEAMS · 104 MATCHES
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-snug text-ink sm:text-4xl">
          当 AI 遇上世界杯
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-mut">
          <strong className="text-ink">全球顶尖大模型 × 竞彩官方数据</strong>，两种分析模式带你从
          概率学角度看懂每一场球的阵容、数据与赔率逻辑——只做信息和效率，不提供任何投注服务。
        </p>
        {next && (
          <div className="mt-6">
            <Countdown
              target={next.utcDate}
              label={`${teamNameZh(next.homeTeam.name)} vs ${teamNameZh(next.awayTeam.name)}`}
            />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/matches"
            className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            查看 AI 分析
          </Link>
          <Link
            href="/calculator"
            className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-ink transition hover:border-neon/60 hover:text-neon"
          >
            打开赔率工具
          </Link>
        </div>
      </section>

      {/* HomeFeed：今日/昨日比赛 + 弹幕 */}
      <HomeFeed />

      {/* 旧赛程速览占位（已移至顶部，保留空节点供后续删除） */}
      {false && ticker.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-mut">
              <span className="anim-pulse-dot h-2 w-2 rounded-full bg-neon" />
              赛程速览
            </h2>
            <Link href="/matches" className="text-xs text-neon hover:underline">
              完整赛程 →
            </Link>
          </div>
          <MatchTicker matches={ticker} />
        </section>
      )}

    </div>
  );
}
