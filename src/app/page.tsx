import Link from "next/link";
import Countdown from "@/components/Countdown";
import MatchTicker, { type TickerMatch } from "@/components/MatchTicker";
import { ANALYSIS_MODES } from "@/lib/analysis-modes";
import { getWorldCupMatches, type FdMatchStatus } from "@/lib/football-data";
import { teamNameZh } from "@/lib/team-names";

export const revalidate = 60;

function mapStatus(s: FdMatchStatus): TickerMatch["status"] {
  if (s === "IN_PLAY" || s === "PAUSED") return "live";
  if (s === "FINISHED" || s === "AWARDED") return "finished";
  return "scheduled";
}

/** 世界杯小知识（全部与本届赛事/本站工具直接相关） */
const KNOWLEDGE = [
  {
    title: "本届新赛制",
    text: "2026 世界杯首次扩军到 48 队，分 12 个小组，每组前两名加 8 个成绩最好的第三名晋级 32 强，总场次 104 场，决赛 7 月 19 日打响。",
  },
  {
    title: "观赛时差指南",
    text: "美加墨三国主办，比赛多在北京时间凌晨 0 点到上午 12 点之间开球。小组赛阶段每天最多 4 场，黄金场次集中在早上 6 点到 10 点。",
  },
  {
    title: "赔率与概率",
    text: "十进制赔率的倒数就是市场隐含概率，三项之和会大于 1（多出的部分是返还率损耗）。本站工具会自动归一化成可比的百分比。",
  },
  {
    title: "什么是串关",
    text: "把多场比赛的结果组合在一起计算，总赔率为各场连乘，全中才有效。场次越多理论回报越高、全中概率也指数级下降——工具页可以直观算给你看。",
  },
] as const;

export default async function Home() {
  const matches = await getWorldCupMatches().catch(() => []);
  const sorted = matches
    .slice()
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  const upcoming = sorted.filter((m) => m.status !== "FINISHED" && m.status !== "AWARDED");
  const next = upcoming.find((m) => m.status === "TIMED" || m.status === "SCHEDULED");

  const ticker: TickerMatch[] = upcoming.slice(0, 40).map((m) => ({
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
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Hero：当 AI 遇上世界杯 */}
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

      {/* 比赛滚动条 */}
      {ticker.length > 0 && (
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

      {/* AI 深度解读 */}
      <section className="mt-10">
        <h2 className="text-center text-xs font-semibold tracking-[0.25em] text-faint">
          AI 深度解读
        </h2>
        <p className="mt-2 text-center text-sm text-mut">
          从阵容、战术变量和公开价格信息里拆出赛前线索
        </p>
        <div className="mt-5 grid gap-3">
          {Object.values(ANALYSIS_MODES)
            .filter((mode) => !mode.free)
            .map((mode) => (
            <div
              key={mode.key}
              className={`card anim-fade-up p-6 ${mode.free ? "" : "border-amber/25"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl" aria-hidden>
                  {mode.icon}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    mode.free
                      ? "bg-neon/10 text-neon"
                      : "border border-amber/30 bg-amber/10 text-amber"
                  }`}
                >
                  {mode.free ? "免费" : "订阅尊享"}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold text-ink">
                {mode.name}
                <span className="font-num ml-2 text-[10px] font-semibold tracking-widest text-faint">
                  {mode.en}
                </span>
              </h3>
              <p className="mt-1 text-sm font-medium text-mut">{mode.tagline}</p>
              <p className="mt-2 text-sm leading-relaxed text-mut">{mode.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 世界杯小知识 */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-mut">世界杯小知识</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {KNOWLEDGE.map((k, i) => (
            <article
              key={k.title}
              className="card anim-fade-up p-5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-3 w-1 rounded-full bg-neon" />
                {k.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-mut">{k.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
