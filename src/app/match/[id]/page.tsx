import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DISCLAIMER, impliedProbabilities } from "@/lib/odds";
import type { PreviewReport } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";
import { teamNameZh } from "@/lib/team-names";
import { type TeamStats } from "./AiReportPanel";
import MaxIntelPanel from "./MaxIntelPanel";

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
interface TeamProfile {
  team_fd_id: number;
  coach: string | null;
  coach_nationality: string | null;
  style: string | null;
  key_players: { name: string; position: string; club: string }[] | null;
  wc_history: { appearances: number; best_result: string; titles: number } | null;
  qualifying_summary: string | null;
}
interface H2HRow {
  team_a_fd_id: number;
  team_b_fd_id: number;
  team_a_name: string;
  team_b_name: string;
  total_matches: number;
  team_a_wins: number;
  draws: number;
  team_b_wins: number;
  total_goals_a: number;
  total_goals_b: number;
  summary: string | null;
  meetings: { year: number; round: string; score: string; result: string; venue_city: string }[] | null;
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

const BEST_RESULT_ZH: Record<string, string> = {
  "Winner": "冠军",
  "Runner-up": "亚军",
  "Third place": "季军",
  "Semi-finals": "四强",
  "Quarter-finals": "八强",
  "Round of 16": "十六强",
  "Group stage": "小组赛",
  "First round": "小组赛",
};

function formatBestResult(s: string): string {
  const m = s.match(/^(.+?)\s*\((\d{4})\)$/);
  if (!m) return s;
  const [, phase, year] = m;
  const zh = BEST_RESULT_ZH[phase.trim()];
  return zh ? `${zh}（${year}）` : s;
}
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

  const profilesRes = teamIds.length
    ? await db
        .from("team_profiles")
        .select("team_fd_id, coach, coach_nationality, style, key_players, wc_history, qualifying_summary")
        .in("team_fd_id", teamIds)
    : { data: [] as TeamProfile[] };

  let h2hRes = { data: null as H2HRow | null };
  if (teamIds.length === 2) {
    const [a, b] = teamIds;
    const { data: h2hData } = await db
      .from("team_h2h")
      .select("*")
      .or(`and(team_a_fd_id.eq.${a},team_b_fd_id.eq.${b}),and(team_a_fd_id.eq.${b},team_b_fd_id.eq.${a})`)
      .limit(1)
      .maybeSingle();
    h2hRes.data = h2hData as H2HRow | null;
  }

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
    profiles: (profilesRes.data ?? []) as TeamProfile[],
    h2h: h2hRes.data,
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

/* ---------- 小组积分榜（从 Supabase matches 表计算） ---------- */

interface StandingRow {
  teamId: number;
  name: string;
  logo: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}

async function getGroupStandings(groupName: string): Promise<StandingRow[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select(
      "status, home_score, away_score, home:teams!matches_home_team_id_fkey(id, name_zh, logo_url), away:teams!matches_away_team_id_fkey(id, name_zh, logo_url)",
    )
    .eq("group_name", groupName)
    .eq("stage", "group");

  const map = new Map<number, StandingRow>();

  const ensureTeam = (team: { id: number; name_zh: string; logo_url: string | null } | null) => {
    if (!team) return;
    if (!map.has(team.id)) {
      map.set(team.id, { teamId: team.id, name: team.name_zh, logo: team.logo_url, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 });
    }
  };

  for (const m of data ?? []) {
    const home = Array.isArray(m.home) ? m.home[0] : m.home as { id: number; name_zh: string; logo_url: string | null } | null;
    const away = Array.isArray(m.away) ? m.away[0] : m.away as { id: number; name_zh: string; logo_url: string | null } | null;
    ensureTeam(home);
    ensureTeam(away);

    if (m.status !== "finished" || m.home_score === null || m.away_score === null) continue;

    const hs = m.home_score as number;
    const as_ = m.away_score as number;
    const hr = map.get(home!.id)!;
    const ar = map.get(away!.id)!;
    hr.played++; ar.played++;
    hr.gf += hs; hr.ga += as_;
    ar.gf += as_; ar.ga += hs;
    if (hs > as_) { hr.won++; hr.pts += 3; ar.lost++; }
    else if (hs < as_) { ar.won++; ar.pts += 3; hr.lost++; }
    else { hr.draw++; hr.pts++; ar.draw++; ar.pts++; }
  }

  return [...map.values()].sort((a, b) =>
    b.pts !== a.pts ? b.pts - a.pts :
    (b.gf - b.ga) !== (a.gf - a.ga) ? (b.gf - b.ga) - (a.gf - a.ga) :
    b.gf - a.gf
  );
}

function GroupTable({
  group,
  rows,
  highlightIds,
}: {
  group: string;
  rows: StandingRow[];
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
          {rows.map((r, i) => {
            const mine = highlightIds.includes(r.teamId);
            const gd = r.gf - r.ga;
            return (
              <tr key={r.teamId} className={`border-t border-line ${mine ? "bg-neon/5" : ""}`}>
                <td className="py-2 text-mut">{i + 1}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2 font-sans text-ink">
                    {r.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo} alt="" className="h-4 w-4 object-contain" />
                    )}
                    <span className={mine ? "font-semibold" : ""}>{r.name}</span>
                  </span>
                </td>
                <td className="py-2 text-center text-mut">{r.played}</td>
                <td className="py-2 text-center text-mut">{r.won}/{r.draw}/{r.lost}</td>
                <td className="py-2 text-center text-mut">{gd > 0 ? `+${gd}` : gd}</td>
                <td className="py-2 text-right font-bold text-ink">{r.pts}</td>
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

/* ---------- 队伍档案 ---------- */
function TeamProfileCard({ profile, team }: { profile: TeamProfile; team: TeamRow }) {
  const posZh: Record<string, string> = { GK: "门将", DEF: "后卫", MID: "中场", FWD: "前锋" };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {team.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />
        )}
        <span className="text-sm font-semibold text-ink">{team.name_zh}</span>
      </div>
      {profile.coach && (
        <div className="flex gap-2 text-xs">
          <span className="text-faint w-10 shrink-0">主教练</span>
          <span className="text-mut">{profile.coach}{profile.coach_nationality ? `（${profile.coach_nationality}）` : ""}</span>
        </div>
      )}
      {profile.wc_history && (
        <div className="flex gap-2 text-xs">
          <span className="text-faint w-10 shrink-0">历史</span>
          <span className="text-mut">参赛 {profile.wc_history.appearances} 届{profile.wc_history.titles > 0 ? `，${profile.wc_history.titles} 次冠军` : ""}，最佳战绩：{formatBestResult(profile.wc_history.best_result)}</span>
        </div>
      )}
      {profile.style && (
        <div className="flex gap-2 text-xs">
          <span className="text-faint w-10 shrink-0">风格</span>
          <span className="text-mut leading-relaxed">{profile.style}</span>
        </div>
      )}
      {profile.key_players && profile.key_players.length > 0 && (
        <div className="flex gap-2 text-xs">
          <span className="text-faint w-10 shrink-0 pt-0.5">核心</span>
          <div className="flex flex-wrap gap-1.5">
            {profile.key_players.map((p) => (
              <span key={p.name} className="rounded-full bg-raised px-2 py-0.5 text-mut">
                {posZh[p.position] ?? p.position} · {p.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 历史交锋 ---------- */
function H2HSection({ h2h, home, away }: { h2h: H2HRow; home: TeamRow; away: TeamRow }) {
  // 确保 home/away 与 team_a/team_b 对应
  const homeIsA = h2h.team_a_fd_id === home.id;
  const homeWins = homeIsA ? h2h.team_a_wins : h2h.team_b_wins;
  const awayWins = homeIsA ? h2h.team_b_wins : h2h.team_a_wins;
  const meetings = (h2h.meetings ?? []).slice(-5).reverse(); // 最近5场，最新在前

  return (
    <section className="card anim-fade-up p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="h-3 w-1 rounded-full bg-amber" />
        世界杯历史交锋
      </h2>
      {/* 胜负统计 */}
      <div className="mb-4 flex items-center justify-between text-center">
        <div>
          <p className="font-num text-2xl font-bold text-neon">{homeWins}</p>
          <p className="text-xs text-faint">{home.name_zh} 胜</p>
        </div>
        <div>
          <p className="font-num text-2xl font-bold text-mut">{h2h.draws}</p>
          <p className="text-xs text-faint">平局</p>
        </div>
        <div>
          <p className="font-num text-2xl font-bold text-amber">{awayWins}</p>
          <p className="text-xs text-faint">{away.name_zh} 胜</p>
        </div>
      </div>
      {/* 总进球 */}
      <div className="mb-3 flex items-center justify-between text-xs text-faint">
        <span>共 {h2h.total_matches} 场交锋</span>
        <span>总进球 {h2h.total_goals_a + h2h.total_goals_b}</span>
      </div>
      {/* 简要描述 */}
      {h2h.summary && (
        <p className="mb-3 text-xs leading-relaxed text-mut">{h2h.summary}</p>
      )}
      {/* 历次对阵列表 */}
      {meetings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">历次对阵</p>
          {meetings.map((m, i) => {
            const [scoreA, scoreB] = m.score.split("-").map(Number);
            const homeScore = homeIsA ? scoreA : scoreB;
            const awayScore = homeIsA ? scoreB : scoreA;
            return (
              <div key={i} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-xs">
                <span className="text-faint w-8">{m.year}</span>
                <span className="text-faint flex-1 text-center">{m.round}</span>
                <span className="font-num font-semibold text-ink tabular-nums">
                  {homeScore}–{awayScore}
                </span>
                <span className="text-faint flex-1 text-right">{m.venue_city}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- 页面 ---------- */

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getMatchBundle(Number(id));
  if (!bundle) notFound();
  const { match, home, away, report, squads, odds, profiles, h2h } = bundle;

  const finished = match.status === "finished";
  const live = match.status === "live";

  // 小组赛阶段从 Supabase matches 表计算积分榜
  let standings: StandingRow[] | null = null;
  if (match.stage === "group" && match.group_name) {
    standings = await getGroupStandings(match.group_name).catch(() => null);
    if (standings && standings.length === 0) standings = null;
  }

  const homePlayers = home ? squads.filter((s) => s.team_id === home.id) : [];
  const awayPlayers = away ? squads.filter((s) => s.team_id === away.id) : [];
  const homeProfile = home ? profiles.find((p) => p.team_fd_id === home.id) ?? null : null;
  const awayProfile = away ? profiles.find((p) => p.team_fd_id === away.id) ?? null : null;

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

        {/* 队伍档案 */}
        {home && away && (homeProfile || awayProfile) && (
          <section className="card anim-fade-up p-5" style={{ animationDelay: "100ms" }}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-3 w-1 rounded-full bg-neon" />
              队伍信息
            </h2>
            <div className="space-y-1">
              {homeProfile && <TeamProfileCard profile={homeProfile} team={home} />}
              {awayProfile && (
                <div className="border-t border-line pt-4 mt-4">
                  <TeamProfileCard profile={awayProfile} team={away} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* 历史交锋 */}
        {home && away && h2h && (
          <H2HSection h2h={h2h} home={home} away={away} />
        )}

        {/* Max 专属临场情报 */}
        {home && away && (
          <MaxIntelPanel
            matchId={match.id as number}
            homeTeamName={home.name_zh}
            awayTeamName={away.name_zh}
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

        {/* 固定免责声明（第 0 章第 3 条） */}
        <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
          {DISCLAIMER}
          本页分析由 AI 基于公开数据生成，仅为信息整理，不构成任何购彩建议。
        </p>
      </div>
    </div>
  );
}
