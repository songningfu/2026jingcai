import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DISCLAIMER, impliedProbabilities } from "@/lib/odds";
import type { PreviewReport } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";
import AiReportPanel from "./AiReportPanel";

export const revalidate = 300;

interface TeamRow {
  id: number;
  name_zh: string;
  logo_url: string | null;
  group_name: string | null;
}
interface OddsRow {
  play_type: string;
  handicap: number | null;
  outcome: string;
  odd: number;
  captured_at: string;
}
interface SquadRow {
  team_id: number;
  player_name: string;
  position: string | null;
  shirt_number: number | null;
  club: string | null;
  date_of_birth: string | null;
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

  const [oddsRes, squadsRes] = await Promise.all([
    db
      .from("odds")
      .select("play_type, handicap, outcome, odd, captured_at")
      .eq("match_id", id)
      .order("captured_at", { ascending: false })
      .limit(40),
    teamIds.length
      ? db
          .from("squads")
          .select("team_id, player_name, position, shirt_number, club, date_of_birth")
          .in("team_id", teamIds)
          .order("shirt_number", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as SquadRow[] }),
  ]);

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
    odds: (oddsRes.data ?? []) as OddsRow[],
    squads: (squadsRes.data ?? []) as SquadRow[],
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
    description: `2026 世界杯 ${home} 对阵 ${away}：官方赔率、双方大名单、AI 中性分析。仅供参考，不构成购彩建议。`,
  };
}

/* ---------- 赔率卡 ---------- */

function latestSet(odds: OddsRow[], playType: string): OddsRow[] {
  const seen = new Set<string>();
  const out: OddsRow[] = [];
  for (const row of odds) {
    if (row.play_type !== playType) continue;
    const key = `${row.handicap ?? 0}:${row.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function OddsTriple({ title, rows }: { title: string; rows: OddsRow[] }) {
  const order = ["主胜", "平", "客胜"];
  const sorted = order
    .map((o) => rows.find((r) => r.outcome === o))
    .filter((r): r is OddsRow => !!r);
  if (sorted.length !== 3) return null;
  const implied = impliedProbabilities(sorted.map((r) => Number(r.odd)));
  return (
    <div>
      <p className="mb-2 text-xs text-mut">
        {title}
        {implied && (
          <span className="ml-2 text-faint">
            理论返还率 <span className="font-num">{(implied.returnRate * 100).toFixed(1)}%</span>
          </span>
        )}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {sorted.map((row, i) => {
          const p = implied ? implied.probs[i] : null;
          return (
            <div key={row.outcome} className="rounded-lg bg-raised p-3 text-center">
              <div className="text-xs text-mut">{row.outcome}</div>
              <div className="font-num mt-1 text-2xl font-bold tabular-nums text-amber">
                {Number(row.odd).toFixed(2)}
              </div>
              {p !== null && (
                <>
                  <div className="font-num mt-1 text-xs tabular-nums text-neon">
                    {(p * 100).toFixed(1)}%
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="anim-grow-bar h-full rounded-full bg-neon/70"
                      style={{ width: `${p * 100}%`, animationDelay: `${i * 120}ms` }}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 名单卡 ---------- */

function age(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600_000));
}

function SquadList({ team, players }: { team: TeamRow; players: SquadRow[] }) {
  const ages = players.map((p) => age(p.date_of_birth)).filter((a): a is number => a !== null);
  const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : null;
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
          {players.length} 人{avgAge ? ` · 平均 ${avgAge} 岁` : ""}
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
  const { match, home, away, report, odds, squads } = bundle;

  const finished = match.status === "finished";
  const live = match.status === "live";
  const whl = latestSet(odds, "whl");
  const handicapRows = latestSet(odds, "handicap");
  const handicapValue = handicapRows[0]?.handicap;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 比赛头部 */}
      <div className="card anim-fade-up relative overflow-hidden px-6 py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/60 to-transparent" />
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
        {/* 官方赔率 */}
        {whl.length === 3 && (
          <section className="card anim-fade-up p-5" style={{ animationDelay: "100ms" }}>
            <h2 className="mb-4 flex items-center justify-between text-sm font-semibold text-ink">
              <span className="flex items-center gap-2">
                <span className="h-3 w-1 rounded-full bg-amber" />
                竞彩官方赔率
              </span>
              <span className="text-xs font-normal text-faint">
                更新于 {new Date(whl[0].captured_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
              </span>
            </h2>
            <div className="space-y-4">
              <OddsTriple title="胜平负" rows={whl} />
              {handicapRows.length === 3 && (
                <OddsTriple
                  title={`让球胜平负（${handicapValue! > 0 ? "+" : ""}${handicapValue}）`}
                  rows={handicapRows}
                />
              )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-faint">
              绿色为赔率反推的归一化概率，含市场情绪，非真实胜率。{DISCLAIMER}
            </p>
          </section>
        )}

        {/* 双方大名单 */}
        {home && away && squads.length > 0 && (
          <section className="card anim-fade-up p-5" style={{ animationDelay: "180ms" }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-3 w-1 rounded-full bg-neon" />
              双方大名单
            </h2>
            <div className="space-y-2">
              <SquadList team={home} players={squads.filter((s) => s.team_id === home.id)} />
              <SquadList team={away} players={squads.filter((s) => s.team_id === away.id)} />
            </div>
            <p className="mt-3 text-xs text-faint">
              大名单为赛前注册名单，不等同于首发阵容；以官方临场公布为准。
            </p>
          </section>
        )}

        {/* AI 报告（点击启动，动画揭示） */}
        <div className="anim-fade-up" style={{ animationDelay: "260ms" }}>
          <AiReportPanel report={report} />
        </div>

        {/* 固定免责声明（第 0 章第 3 条） */}
        <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
          {DISCLAIMER}
          本页分析由 AI 基于公开数据生成，仅为信息整理，不构成任何购彩建议。
        </p>
      </div>
    </div>
  );
}
