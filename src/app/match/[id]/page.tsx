import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DISCLAIMER } from "@/lib/odds";
import type { PreviewReport } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 300;

interface TeamRow {
  name_zh: string;
  logo_url: string | null;
  group_name: string | null;
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

async function getMatch(id: number) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select(
      "id, stage, group_name, kickoff_at, status, home_score, away_score, home:teams!matches_home_team_id_fkey(name_zh, logo_url, group_name), away:teams!matches_away_team_id_fkey(name_zh, logo_url, group_name), reports(preview_json)",
    )
    .eq("id", id)
    .single();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const match = await getMatch(Number(id));
  if (!match) return { title: "比赛不存在" };
  const home = (match.home as unknown as TeamRow)?.name_zh ?? "待定";
  const away = (match.away as unknown as TeamRow)?.name_zh ?? "待定";
  return {
    title: `${home} vs ${away} — AI 数据报告`,
    description: `2026 世界杯 ${home} 对阵 ${away}：阵容动态、数据洞察与 AI 中性分析。仅供参考，不构成购彩建议。`,
  };
}

const kickoffFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function Team({ team }: { team: TeamRow | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {team?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-14 w-14 object-contain" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-white/20" />
      )}
      <span className="font-semibold">{team?.name_zh ?? "待定"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-emerald-800">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="mr-2 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
        {label}
      </span>
      {text}
    </div>
  );
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = await getMatch(Number(id));
  if (!match) notFound();

  const home = match.home as unknown as TeamRow | null;
  const away = match.away as unknown as TeamRow | null;
  // reports 对 matches 一对一：PostgREST 可能返回对象或单元素数组，两种都兼容
  const rawReports = match.reports as unknown as
    | { preview_json: PreviewReport | null }
    | { preview_json: PreviewReport | null }[]
    | null;
  const report = (Array.isArray(rawReports) ? rawReports[0] : rawReports)?.preview_json ?? null;
  const finished = match.status === "finished";
  const live = match.status === "live";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 比赛头部 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-600 px-6 py-8 text-white">
        <p className="mb-4 text-center text-sm text-emerald-100">
          {STAGE_ZH[match.stage] ?? match.stage}
          {match.group_name ? ` · ${match.group_name}组` : ""} ·{" "}
          {kickoffFmt.format(new Date(match.kickoff_at))}（北京时间）
        </p>
        <div className="flex items-center justify-center gap-8">
          <Team team={home} />
          <div className="text-center">
            {finished || live ? (
              <span className={`text-3xl font-bold tabular-nums ${live ? "text-amber-300" : ""}`}>
                {match.home_score ?? 0} - {match.away_score ?? 0}
              </span>
            ) : (
              <span className="text-2xl font-bold text-emerald-200">VS</span>
            )}
            {live && <p className="mt-1 text-xs text-amber-300">进行中</p>}
          </div>
          <Team team={away} />
        </div>
      </div>

      {/* AI 报告 */}
      <div className="mt-6 space-y-4">
        {report ? (
          <>
            <Section title="基本面">
              <Field label="阵容" text={report.basic.lineup} />
              <Field label="伤停" text={report.basic.injuries} />
              <Field label="近期状态" text={report.basic.recent_form} />
              <Field label="历史交锋" text={report.basic.h2h} />
            </Section>
            <Section title="数据洞察">
              <Field label="攻防" text={report.data_insight.attack_defense} />
              <Field label="关键球员" text={report.data_insight.key_players} />
              <Field label="状态曲线" text={report.data_insight.form_curve} />
            </Section>
            <Section title="AI 赛前分析">
              <p>{report.ai_preview}</p>
            </Section>
            <Section title="市场观点解读">
              <p>{report.odds_reading}</p>
            </Section>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center text-sm text-neutral-500">
            本场 AI 数据报告生成中，临近开赛自动发布，稍后再来看看。
          </div>
        )}

        {/* 第 0 章第 3 条：固定免责声明 */}
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          {DISCLAIMER}
          本页分析由 AI 基于公开数据生成，仅为信息整理，不构成任何购彩建议。
        </p>
      </div>
    </div>
  );
}
