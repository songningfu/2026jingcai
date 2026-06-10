import "server-only";

/**
 * AI 报告生成（规格文档第 6 章）
 * 流程：取结构化数据 → 固定 prompt 调 AI → 逐字段禁用词过滤 → 入库。
 * 过滤不通过的字段会被中性文案替换；命中过多时整体重生成由调用方决定。
 */
import { chatJSON } from "./ai";
import { DISCLAIMER } from "./odds";
import { filterContent } from "./banned-terms";
import { supabaseAdmin } from "./supabase";

/** 6.2 报告 JSON 结构 */
export interface PreviewReport {
  basic: { lineup: string; injuries: string; recent_form: string; h2h: string };
  data_insight: { attack_defense: string; key_players: string; form_curve: string };
  ai_preview: string;
  odds_reading: string;
  disclaimer: string;
}

/** 6.3 固定 System Prompt——约束部分不得修改 */
const SYSTEM_PROMPT = `你是一个体育赛事数据分析助手，为一个"竞彩数据资讯平台"生成比赛分析内容。

【绝对禁止】
- 禁止给出任何投注建议或倾向：不得出现"推荐/看好/建议买/稳/必胜/必中/跟单/上车/这场买X/押X/市场倾向/更可能/概率较高"等任何引导下注的表达。
- 禁止预测确定性结果或承诺胜率、准确率、收益。
- 你只做客观描述与中性分析：陈述数据、对比双方、指出战术看点与不确定性。

【任务】
基于我提供的结构化比赛数据，生成中性、专业、可读的赛事分析，严格按给定 JSON schema 输出，不要输出 schema 之外的任何文字、不要 markdown 代码块包裹。

JSON schema：
{
  "basic": { "lineup": "...", "injuries": "...", "recent_form": "...", "h2h": "..." },
  "data_insight": { "attack_defense": "...", "key_players": "...", "form_curve": "..." },
  "ai_preview": "对本场的中性分析（描述双方特点、可能的战术看点，不给结论）",
  "odds_reading": "只描述竞彩官方赔率结构、赔率高低差异与价格分布（标注为市场价格信息，非建议；无赔率数据时仅说明数据暂缺；不得写哪方更可能或概率较高）"
}
每个字段为 80-200 字的中文段落。资料不足的字段基于球队公开背景常识谨慎概述，并注明"赛前详细数据暂缺"。

【数据红线】
- odds_reading 只能解读我提供的"竞彩赔率"数据；未提供时只写"竞彩赔率数据暂未更新"，禁止引用、估计或转述任何其他机构（尤其是境外博彩公司）的赔率或盘口信息。
- odds_reading 可以描述赔率数值、让球数值、返还率或归一化概率分布，但不得把赔率差异转写成赛果判断、投注倾向或"哪方更可能"。
- 不得虚构事实：主办地、东道主、历史战绩等以我提供的背景事实为准，不确定的信息不要写。
- 如果只提供"球员名单/大名单"，只能据此描述阵容储备和位置结构；不得把大名单写成首发名单，不得虚构伤停。

【语气】
像体育媒体的赛前/赛后稿，理性、平衡，强调"足球结果存在高度不确定性"。`;

interface TeamRef {
  id?: number;
  name_zh?: string;
  name_en?: string | null;
  group_name?: string | null;
}

interface SquadRow {
  team_id: number;
  player_name: string | null;
  position: string | null;
  status: string | null;
  shirt_number?: number | null;
  club?: string | null;
  nationality?: string | null;
}

/** 遍历报告所有字符串字段做后置过滤（6.4），返回过滤后对象与命中词 */
function sanitizeReport(report: PreviewReport): { report: PreviewReport; hits: string[] } {
  const allHits: string[] = [];
  const clean = (s: string): string => {
    const r = filterContent(s);
    allHits.push(...r.hits);
    return r.text;
  };
  return {
    report: {
      basic: {
        lineup: clean(report.basic.lineup),
        injuries: clean(report.basic.injuries),
        recent_form: clean(report.basic.recent_form),
        h2h: clean(report.basic.h2h),
      },
      data_insight: {
        attack_defense: clean(report.data_insight.attack_defense),
        key_players: clean(report.data_insight.key_players),
        form_curve: clean(report.data_insight.form_curve),
      },
      ai_preview: clean(report.ai_preview),
      odds_reading: clean(report.odds_reading),
      disclaimer: DISCLAIMER,
    },
    hits: allHits,
  };
}

function parsePreviewReport(raw: string): PreviewReport {
  try {
    return JSON.parse(raw) as PreviewReport;
  } catch (firstError) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as PreviewReport;
      } catch {
        // Fall through to the original error with a compact preview for debugging.
      }
    }
    const preview = raw.replace(/\s+/g, " ").slice(0, 240);
    throw new Error(
      `AI 报告 JSON 解析失败: ${
        firstError instanceof Error ? firstError.message : String(firstError)
      }; raw=${preview}`,
    );
  }
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatSquadRows(rows: SquadRow[], teamId: number | undefined) {
  if (!teamId) return [];
  return rows
    .filter((row) => row.team_id === teamId && row.player_name)
    .slice(0, 30)
    .map((row) => ({
      name: row.player_name,
      position: row.position,
      number: row.shirt_number ?? null,
      club: row.club ?? null,
      nationality: row.nationality ?? null,
      status: row.status,
    }));
}

async function getSquadsForTeams(teamIds: number[]): Promise<SquadRow[]> {
  if (teamIds.length === 0) return [];
  const db = supabaseAdmin();
  const enriched = await db
    .from("squads")
    .select("team_id, player_name, position, status, shirt_number, club, nationality")
    .in("team_id", teamIds)
    .order("shirt_number", { ascending: true, nullsFirst: false })
    .limit(80);

  if (!enriched.error) return (enriched.data ?? []) as SquadRow[];

  // Existing databases may not have the enrichment migration yet. Fall back to the original schema.
  const basic = await db
    .from("squads")
    .select("team_id, player_name, position, status")
    .in("team_id", teamIds)
    .limit(80);

  if (basic.error) {
    console.warn(`[squads] 读取失败，报告将不使用阵容数据: ${basic.error.message}`);
    return [];
  }
  return (basic.data ?? []) as SquadRow[];
}

/** 为一场比赛生成赛前报告并入库；返回禁用词命中情况供日志 */
export async function generatePreviewReport(matchId: number): Promise<{ hits: string[] }> {
  const db = supabaseAdmin();

  const { data: match, error } = await db
    .from("matches")
    .select(
      "id, stage, group_name, kickoff_at, status, home:teams!matches_home_team_id_fkey(id, name_zh, name_en, group_name), away:teams!matches_away_team_id_fkey(id, name_zh, name_en, group_name)",
    )
    .eq("id", matchId)
    .single();
  if (error || !match) throw new Error(`比赛 ${matchId} 不存在: ${error?.message}`);

  const home = relationOne(match.home as TeamRef | TeamRef[] | null);
  const away = relationOne(match.away as TeamRef | TeamRef[] | null);
  const squadRows = await getSquadsForTeams(
    [home?.id, away?.id].filter((id): id is number => typeof id === "number"),
  );

  const { data: odds } = await db
    .from("odds")
    .select("play_type, handicap, outcome, odd, captured_at")
    .eq("match_id", matchId)
    .order("captured_at", { ascending: false })
    .limit(20);

  const userPrompt = `数据如下：${JSON.stringify(
    {
      赛事: "2026 FIFA 世界杯",
      背景事实: "本届世界杯由美国、加拿大、墨西哥三国联合主办，共48队104场；东道主三队自动晋级、未参加预选赛；除这三队外其他球队均无主场优势",
      阶段: match.stage,
      小组: match.group_name,
      开球时间UTC: match.kickoff_at,
      主队: home,
      客队: away,
      球员名单:
        squadRows.length > 0
          ? {
              数据说明: "以下为赛前大名单/球员资料，不等同于首发，不代表伤停状态",
              主队: formatSquadRows(squadRows, home?.id),
              客队: formatSquadRows(squadRows, away?.id),
            }
          : "暂无（squads 数据尚未导入）",
      竞彩赔率: odds && odds.length > 0 ? odds : "暂无（赔率数据尚未接入）",
    },
    null,
    2,
  )}`;

  const raw = await chatJSON({ system: SYSTEM_PROMPT, user: userPrompt });
  const parsed = parsePreviewReport(raw);
  const { report, hits } = sanitizeReport(parsed);

  const { error: upsertErr } = await db.from("reports").upsert(
    {
      match_id: matchId,
      preview_json: report,
      is_premium: false, // 支付未接入前全部免费（规格 8.3）
      generated_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (upsertErr) throw new Error(`报告入库失败: ${upsertErr.message}`);

  if (hits.length > 0) {
    console.warn(`[banned-terms] match=${matchId} 命中并替换:`, hits);
  }
  return { hits };
}

/** 为未来 N 小时内开球且还没有报告的比赛批量生成 */
export async function generateUpcomingReports(
  hoursAhead = 48,
  limit = 5,
): Promise<{ generated: number[]; hits: Record<number, string[]> }> {
  const db = supabaseAdmin();
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);

  const { data: matches, error } = await db
    .from("matches")
    .select("id, reports(match_id)")
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", until.toISOString())
    .order("kickoff_at")
    .limit(50);
  if (error) throw new Error(error.message);

  const pending = (matches ?? [])
    .filter((m) => !m.reports || (Array.isArray(m.reports) && m.reports.length === 0))
    .slice(0, limit);

  const generated: number[] = [];
  const hits: Record<number, string[]> = {};
  for (const m of pending) {
    const r = await generatePreviewReport(m.id);
    generated.push(m.id);
    if (r.hits.length) hits[m.id] = r.hits;
  }
  return { generated, hits };
}
