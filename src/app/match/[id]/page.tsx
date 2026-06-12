import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStandings, type FdStandingRow } from "@/lib/football-data";
import { DISCLAIMER, impliedProbabilities } from "@/lib/odds";
import type { PreviewReport } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";
import { teamNameZh } from "@/lib/team-names";
import { listModelOptions } from "@/lib/models";
import { type TeamStats } from "./AiReportPanel";
import DeepRunPanel from "./DeepRunPanel";

export const revalidate = 300;

interface TeamRow {
  id: number;
  name_zh: string;
  logo_url: string | null;
  group_name: string | null;
}
interface SquadRow {
  team_id: number;
  player_name: string;
  position: string | null;
  shirt_number: number | null;
  club: string | null;
  date_of_birth: string | null;
}
interface OddsRow {
  outcome: string;
  odd: number;
  captured_at: string;
}

const STAGE_ZH: Record<string, string> = {
  group: "小组赛",
  round32: "1/16 决赛",
  round16: "1/8 决赛",
  quarter: "1/4 决赛",
  semi: "半决赛",
  third: "季军赛",
  final: "决赛",
};

const POSITION_ZH: Record<string, string> = {
  Goalkeeper: "门将",
  Defender: "后卫",
  Midfielder: "中场",
  Forward: "前锋",
};
const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

const kickoffFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function age(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600_000));
}

async function getMatchBundle(id: number) {
  const db = supabaseAdmin();
  const { data: match } = await db
    .from("matches")
    .select(
      "id, stage, group_name, kickoff_at, status, home_score, away_score, ht_home, ht_away, home:teams!matches_home_team_id_fkey(id, name_zh, logo_url, group_name), away:teams!matches_away_team_id_fkey(id, name_zh, logo_url, group_name), reports(preview_json)",
    )
    .eq("id", id)
    .single();
  if (!match) return null;

  const home = one(match.home as unknown as TeamRow | TeamRow[] | null);
  const away = one(match.away as unknown as TeamRow | TeamRow[] | null);
  const teamIds = [home?.id, away?.id].filter((x): x is number => typeof x === "number");

  const squadsRes = teamIds.length
    ? await db
        .from("squads")
        .select("team_id, player_name, position, shirt_number, club, date_of_birth")
        .in("team_id", teamIds)
        .order("shirt_number", { ascending: true, nullsFirst: false })
    : { data: [] as SquadRow[] };

  const oddsRes = await db
    .from("odds")
    .select("outcome, odd, captured_at")
    .eq("match_id", id)
    .eq("play_type", "whl")
    .order("captured_at", { ascending: false })
    .limit(20);

  const rawReports = match.reports as unknown as
    | { preview_json: PreviewReport | null }
    | { preview_json: PreviewReport | null }[]
    | null;
  const report = (Array.isArray(rawReports) ? rawReports[0] : rawReports)?.preview_json ?? null;

  return {
    match,
    home,
    away,
    report,
    squads: (squadsRes.data ?? []) as SquadRow[],
    odds: (oddsRes.data ?? []) as OddsRow[],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getMatchBundle(Number(id));
  if (!bundle) return { title: "比赛不存在" };
  const home = bundle.home?.name_zh ?? "待定";
  const away = bundle.away?.name_zh ?? "待定";
  return {
    title: `${home} vs ${away} — 数据与 AI 报告`,
    description: `2026 世界杯 ${home} 对阵 ${away}：小组积分榜、双方大名单、AI 中性分析。仅供参考，不构成购彩建议。`,
  };
}

function teamStats(players: SquadRow[], name: string): TeamStats | null {
  if (players.length === 0) return null;
  const ages = players.map((p) => age(p.date_of_birth)).filter((a): a is number => a !== null);
  const clubs = new Set(players.map((p) => p.club).filter(Boolean));
  return {
    name,
    count: players.length,
    avgAge: ages.length
      ? Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1))
      : null,
    clubs: clubs.size,
  };
}

function fallbackPrediction(oddsRows: OddsRow[]): PreviewReport["prediction"] | null {
  const latest = ["主胜", "平", "客胜"].map((outcome) =>
    oddsRows.find((row) => row.outcome === outcome),
  );
  if (!latest.every(Boolean)) return null;

  const odds = latest.map((row) => Number(row!.odd));
  const implied = impliedProbabilities(odds);
  if (!implied) return null;

  const bestIndex = implied.probs.reduce(
    (best, value, index) => (value > implied.probs[best] ? index : best),
    0,
  );
  const result = (["主队胜", "平局", "客队胜"] as const)[bestIndex];
  const score = (["2-1", "1-1", "1-2"] as const)[bestIndex];
  const top = implied.probs[bestIndex];
  const confidence = top >= 0.55 ? "高" : top >= 0.42 ? "中" : "低";

  return {
    result,
    score,
    confidence,
    reasoning:
      "依据双方名单结构与当前赔率分布生成，比分仅是赛前推演。临场阵容、比赛节奏、定位球和红黄牌都会改变走势，请只作为信息参考。",
  };
}

/* ---------- 小组积分榜 ---------- */

function GroupTable({
  group,
  rows,
  highlightIds,
}: {
  group: string;
  rows: FdStandingRow[];
  highlightIds: number[];
}) {
  return (
    <section className="card anim-fade-up p-5" style={{ animationDelay: "100ms" }}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="h-3 w-1 rounded-full bg-neon" />
        {group}组积分榜
      </h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-faint">
          <tr>
            <th className="py-1.5 font-normal">排名</th>
            <th className="py-1.5 font-normal">球队</th>
            <th className="py-1.5 text-center font-normal">赛</th>
            <th className="py-1.5 text-center font-normal">胜/平/负</th>
            <th className="py-1.5 text-center font-normal">净胜</th>
            <th className="py-1.5 text-right font-normal">积分</th>
          </tr>
        </thead>
        <tbody className="font-num tabular-nums">
          {rows.map((r) => {
            const mine = highlightIds.includes(r.team.id);
            return (
              <tr
                key={r.team.id}
                className={`border-t border-line ${mine ? "bg-neon/5" : ""}`}
              >
                <td className="py-2 text-mut">{r.position}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2 font-sans text-ink">
                    {r.team.crest && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.team.crest} alt="" className="h-4 w-4 object-contain" />
                    )}
                    <span className={mine ? "font-semibold" : ""}>
                      {teamNameZh(r.team.name)}
                    </span>
                  </span>
                </td>
                <td className="py-2 text-center text-mut">{r.playedGames}</td>
                <td className="py-2 text-center text-mut">
                  {r.won}/{r.draw}/{r.lost}
                </td>
                <td className="py-2 text-center text-mut">
                  {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                </td>
                <td className="py-2 text-right font-bold text-ink">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-faint">每组前两名直接晋级，8 个成绩最好的第三名递补进 32 强。</p>
    </section>
  );
}

/* ---------- 名单 ---------- */

function SquadList({ team, players }: { team: TeamRow; players: SquadRow[] }) {
  const stats = teamStats(players, team.name_zh);
  const byPos = POSITION_ORDER.map((pos) => ({
    pos,
    list: players.filter((p) => p.position === pos),
  })).filter((g) => g.list.length > 0);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-raised px-4 py-3 transition hover:bg-raised/70 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          {team.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />
          )}
          {team.name_zh} 大名单
        </span>
        <span className="font-num text-xs tabular-nums text-mut">
          {players.length} 人{stats?.avgAge ? ` · 平均 ${stats.avgAge} 岁` : ""}
          <span className="ml-2 inline-block transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="mt-2 space-y-3 px-1 pb-2">
        {byPos.map(({ pos, list }) => (
          <div key={pos}>
            <p className="mb-1 text-xs text-faint">{POSITION_ZH[pos] ?? pos}</p>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {list.map((p) => (
                <div
                  key={p.player_name}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-ink/90">
                    <span className="font-num mr-1.5 inline-block w-6 text-right tabular-nums text-faint">
                      {p.shirt_number ?? "–"}
                    </span>
                    {p.player_name}
                  </span>
                  <span className="truncate text-right text-xs text-faint">{p.club ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ---------- 页面 ---------- */

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getMatchBundle(Number(id));
  if (!bundle) notFound();
  const { match, home, away, report, squads, odds } = bundle;

  const finished = match.status === "finished";
  const live = match.status === "live";

  // 小组赛阶段拉积分榜
  let standings: FdStandingRow[] | null = null;
  if (match.stage === "group" && match.group_name) {
    const map = await getStandings().catch(() => null);
    standings = map?.get(`GROUP_${match.group_name}`) ?? null;
  }

  const homePlayers = home ? squads.filter((s) => s.team_id === home.id) : [];
  const awayPlayers = away ? squads.filter((s) => s.team_id === away.id) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 比赛头部 */}
      <div className="card anim-fade-up relative overflow-hidden px-6 py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/50 to-transparent" />
        <p className="mb-5 text-center text-xs text-mut">
          {STAGE_ZH[match.stage] ?? match.stage}
          {match.group_name ? ` · ${match.group_name}组` : ""} ·{" "}
          {kickoffFmt.format(new Date(match.kickoff_at))}（北京时间）
        </p>
        <div className="flex items-center justify-center gap-10">
          {[home, away].map((team, i) => (
            <div key={i} className="flex w-24 flex-col items-center gap-2">
              {team?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logo_url} alt="" className="h-14 w-14 object-contain" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-raised" />
              )}
              <span className="font-semibold text-ink">{team?.name_zh ?? "待定"}</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mt-3 text-center">
          {finished || live ? (
            <span
              className={`font-num text-4xl font-bold tabular-nums ${live ? "text-live" : "text-ink"}`}
            >
              {match.home_score ?? 0}–{match.away_score ?? 0}
            </span>
          ) : (
            <span className="font-num text-2xl font-bold text-faint">VS</span>
          )}
        </div>
        {live && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-live">
            <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-live" />
            进行中
          </p>
        )}
        {finished && match.ht_home !== null && (
          <p className="font-num mt-3 text-center text-xs text-faint">
            半场 {match.ht_home}–{match.ht_away}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {/* 小组积分榜 */}
        {standings && match.group_name && (
          <GroupTable
            group={match.group_name}
            rows={standings}
            highlightIds={[home?.id, away?.id].filter((x): x is number => typeof x === "number")}
          />
        )}

        {/* 双方大名单 */}
        {home && away && squads.length > 0 && (
          <section className="card anim-fade-up p-5" style={{ animationDelay: "180ms" }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-3 w-1 rounded-full bg-neon" />
              双方大名单
            </h2>
            <div className="space-y-2">
              <SquadList team={home} players={homePlayers} />
              <SquadList team={away} players={awayPlayers} />
            </div>
            <p className="mt-3 text-xs text-faint">
              大名单为赛前注册名单，不等同于首发阵容；伤停以官方临场公布为准（详见 AI 分析的伤停小节）。
            </p>
          </section>
        )}

        {/* 深度推演（合并）：统计比分概率免费 + 选大模型付费解读 */}
        {!finished && (
          <div id="ai" className="scroll-mt-20 anim-fade-up" style={{ animationDelay: "260ms" }}>
            <DeepRunPanel matchId={match.id} models={listModelOptions()} />
          </div>
        )}

        {/* 固定免责声明（第 0 章第 3 条） */}
        <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
          {DISCLAIMER}
          本页分析由 AI 基于公开数据生成，仅为信息整理，不构成任何购彩建议。
        </p>
      </div>
    </div>
  );
}
