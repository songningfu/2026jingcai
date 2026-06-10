import Link from "next/link";
import { getWorldCupMatches, STATUS_LABELS } from "@/lib/football-data";
import { teamNameZh } from "@/lib/team-names";

export const revalidate = 60;

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const FEATURES = [
  {
    href: "/calculator",
    title: "官方赔率工具",
    desc: "竞彩官方在售赔率自动载入，点选即算概率、注数与模拟金额。",
    tag: "AUTO",
  },
  {
    href: "/matches",
    title: "赛程与比分",
    desc: "104 场完整赛程，北京时间显示，比分每分钟自动更新。",
    tag: "LIVE",
  },
  {
    href: "/games",
    title: "积分竞猜",
    desc: "纯虚拟积分趣味竞猜与排行榜，不涉及任何真钱。",
    tag: "SOON",
  },
] as const;

export default async function Home() {
  const matches = await getWorldCupMatches().catch(() => []);
  const now = Date.now();
  const spotlight = matches
    .filter((m) => new Date(m.utcDate).getTime() > now - 3 * 3600_000)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Hero：球场中圈线稿 */}
      <section className="card anim-fade-up relative overflow-hidden px-7 py-12 sm:px-10">
        <svg
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 text-neon/[0.07]"
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
          用 AI 和数据
          <br />
          看懂世界杯的每一场球
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-mut">
          官方赔率换算、AI 赛事报告、完整赛程数据——我们卖的是信息和效率，不提供任何投注服务。
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/calculator"
            className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-pitch transition hover:brightness-110"
          >
            打开赔率工具
          </Link>
          <Link
            href="/matches"
            className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-ink transition hover:border-neon/50 hover:text-neon"
          >
            查看赛程
          </Link>
        </div>
      </section>

      {/* 今日焦点 */}
      {spotlight.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="anim-pulse-dot h-2 w-2 rounded-full bg-neon" />
            <h2 className="text-sm font-semibold tracking-wide text-mut">近期焦点</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {spotlight.map((m, i) => {
              const live = m.status === "IN_PLAY" || m.status === "PAUSED";
              const finished = m.status === "FINISHED";
              return (
                <Link
                  key={m.id}
                  href={`/match/${m.id}`}
                  className="card anim-fade-up flex items-center justify-between px-5 py-4 transition hover:border-neon/40"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-ink">
                      {teamNameZh(m.homeTeam.name)}
                      <span className="px-1.5 text-faint">vs</span>
                      {teamNameZh(m.awayTeam.name)}
                    </span>
                    <span className="text-xs text-faint">
                      {timeFmt.format(new Date(m.utcDate))} · {m.group?.replace("GROUP_", "") ?? ""}组
                    </span>
                  </div>
                  {live || finished ? (
                    <span
                      className={`font-num text-2xl font-bold tabular-nums ${live ? "text-live" : "text-ink"}`}
                    >
                      {m.score.fullTime.home ?? 0}–{m.score.fullTime.away ?? 0}
                    </span>
                  ) : (
                    <span className="chip">{STATUS_LABELS[m.status]}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 功能入口 */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((card, i) => (
          <Link
            key={card.href}
            href={card.href}
            className="card anim-fade-up group p-5 transition hover:border-neon/40"
            style={{ animationDelay: `${200 + i * 80}ms` }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink group-hover:text-neon">{card.title}</h2>
              <span className="font-num text-[10px] font-semibold tracking-widest text-faint">
                {card.tag}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-mut">{card.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
