import "server-only";

/**
 * AI 报告生成（规格文档第 6 章）
 * 流程：取结构化数据 → 固定 prompt 调 AI → 逐字段禁用词过滤 → 入库。
 * 过滤不通过的字段会被中性文案替换；命中过多时整体重生成由调用方决定。
 */
import { chatJSON } from "./ai";
import { DISCLAIMER, impliedProbabilities } from "./odds";
import { filterContent } from "./banned-terms";
import { runDeepModel } from "./deep-model";
import { supabaseAdmin } from "./supabase";

/** 6.2 报告 JSON 结构 */
export interface PreviewReport {
  basic: { lineup: string; injuries: string; recent_form: string; h2h: string };
  data_insight: { attack_defense: string; key_players: string; form_curve: string };
  prediction?: {
    result: string;
    score: string;
    confidence: "低" | "中" | "高";
    reasoning: string;
    /** 总进球数最可能档位（体彩 TTG 口径，如「2球」「3球」「7+球」）——由统计模型计算，非 AI 猜测 */
    total_goals?: string;
  };
  ai_preview: string;
  odds_reading: string;
  disclaimer: string;
}

/** 6.3 固定 System Prompt——约束部分不得修改 */
const SYSTEM_PROMPT = `你是一个体育赛事数据分析助手，为一个"竞彩数据资讯平台"生成比赛分析内容。

【绝对禁止】
- 禁止给出任何投注建议或倾向：不得出现"推荐/看好/建议买/稳/必胜/必中/跟单/上车/这场买X/押X/市场倾向/更可能/概率较高"等任何引导下注的表达。
- 禁止把预测写成确定性结果，禁止承诺胜率、准确率、收益。
- 允许给出带有不确定性说明的赛果/比分预测；预测只作为赛前推演，不得转化为购彩建议。
- 你主要做客观描述与中性分析：陈述数据、对比双方、指出战术看点与不确定性。

【任务】
基于我提供的结构化比赛数据，生成中性、专业、可读的赛事分析，严格按给定 JSON schema 输出，不要输出 schema 之外的任何文字、不要 markdown 代码块包裹。

JSON schema：
{
  "basic": { "lineup": "...", "injuries": "...", "recent_form": "...", "h2h": "..." },
  "data_insight": { "attack_defense": "...", "key_players": "...", "form_curve": "..." },
  "prediction": { "result": "主队胜/平局/客队胜 三选一", "score": "一个具体比分，如 1-1", "confidence": "低/中/高 三选一", "reasoning": "60-120字，说明预测依据与不确定性" },
  "ai_preview": "对本场的中性分析（描述双方特点、可能的战术看点，不给结论）",
  "odds_reading": "只描述竞彩官方赔率结构、赔率高低差异与价格分布（标注为市场价格信息，非建议；无赔率数据时仅说明数据暂缺；不得写哪方更可能或概率较高）"
}
basic、data_insight、ai_preview、odds_reading 的每个字段为 80-200 字中文段落；prediction.reasoning 为 60-120 字。
资料不足的字段基于球队公开背景常识谨慎概述，并注明"赛前详细数据暂缺"。
data_insight 与 odds_reading 的每个字段都必须引用我提供数据中的至少一个具体数字（如平均年龄、球员号码、效力俱乐部数量、赔率值、归一化概率、返还率），不要写空泛的形容词堆砌。
prediction.result 必须只写"主队胜"、"平局"或"客队胜"之一；prediction.score 必须是一个具体比分；prediction.confidence 只能是"低"、"中"或"高"。
prediction.reasoning 不得出现"推荐/看好/建议/稳/必胜/必中/跟单/上车/押/市场倾向/更可能/概率较高/大概率"等表达。

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
      prediction: report.prediction
        ? {
            result: clean(report.prediction.result),
            score: clean(report.prediction.score),
            confidence: report.prediction.confidence,
            reasoning: clean(report.prediction.reasoning),
            ...(report.prediction.total_goals
              ? { total_goals: clean(report.prediction.total_goals) }
              : {}),
          }
        : undefined,
      ai_preview: clean(report.ai_preview),
      odds_reading: clean(report.odds_reading),
      disclaimer: DISCLAIMER,
    },
    hits: allHits,
  };
}

/**
 * 从模型输出里提取第一个「括号配对完整」的 JSON 对象。
 * 正确处理字符串字面量内的花括号与转义，避免被字符串里的 } 或
 * 模型多吐的第二个对象/尾部垃圾干扰。
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parsePreviewReport(raw: string): PreviewReport {
  // 去掉可能的 markdown 代码围栏
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as PreviewReport;
  } catch (firstError) {
    const candidate = extractFirstJsonObject(cleaned);
    if (candidate) {
      try {
        return JSON.parse(candidate) as PreviewReport;
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

/** 为一场比赛生成赛前报告并入库；返回过滤后的报告与禁用词命中情况 */
export async function generatePreviewReport(
  matchId: number,
): Promise<{ report: PreviewReport; hits: string[] }> {
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

  // 预计算数据摘要：归一化概率 + 名单聚合，让 AI 引用具体数字而非空泛形容
  const whlLatest = ["主胜", "平", "客胜"].map((o) =>
    (odds ?? []).find((r) => r.play_type === "whl" && r.outcome === o),
  );
  const implied = whlLatest.every(Boolean)
    ? impliedProbabilities(whlLatest.map((r) => Number(r!.odd)))
    : null;
  const summarizeSquad = (teamId: number | undefined) => {
    if (!teamId) return null;
    const rows = squadRows.filter((r) => r.team_id === teamId);
    if (rows.length === 0) return null;
    const ages = rows
      .map((r) => {
        const dob = (r as { date_of_birth?: string | null }).date_of_birth;
        if (!dob) return null;
        const t = new Date(dob).getTime();
        return Number.isNaN(t) ? null : (Date.now() - t) / (365.25 * 24 * 3600_000);
      })
      .filter((a): a is number => a !== null);
    const clubs = new Set(rows.map((r) => (r as { club?: string | null }).club).filter(Boolean));
    return {
      名单人数: rows.length,
      平均年龄: ages.length ? Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)) : "未知",
      效力俱乐部数量: clubs.size || "未知",
    };
  };

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
      数据摘要: {
        胜平负归一化概率:
          implied
            ? {
                主胜: `${(implied.probs[0] * 100).toFixed(1)}%`,
                平: `${(implied.probs[1] * 100).toFixed(1)}%`,
                客胜: `${(implied.probs[2] * 100).toFixed(1)}%`,
                理论返还率: `${(implied.returnRate * 100).toFixed(1)}%`,
                说明: "由竞彩官方赔率反推并归一化，含市场情绪，非真实胜率",
              }
            : "暂无",
        主队名单统计: summarizeSquad(home?.id) ?? "暂无",
        客队名单统计: summarizeSquad(away?.id) ?? "暂无",
      },
    },
    null,
    2,
  )}`;

  const raw = await chatJSON({ system: SYSTEM_PROMPT, user: userPrompt });
  const parsed = parsePreviewReport(raw);

  // 用统计模型计算「总进球数最可能档位」注入预测（比 AI 猜测更稳更准）
  if (parsed.prediction) {
    const whlInput = whlLatest.every(Boolean)
      ? { win: Number(whlLatest[0]!.odd), draw: Number(whlLatest[1]!.odd), loss: Number(whlLatest[2]!.odd) }
      : null;
    const TTG_LABELS = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
    const ttgArr = TTG_LABELS.map((label) => {
      const r = (odds ?? []).find((x) => x.play_type === "totalgoals" && x.outcome === label);
      return r ? Number(r.odd) : null;
    });
    const ttgInput = ttgArr.some((v) => v !== null) ? ttgArr : null;
    if (whlInput || ttgInput) {
      const model = runDeepModel(whlInput, undefined, undefined, ttgInput);
      const topIdx = model.totalGoals
        .map((p, i) => ({ i, p }))
        .sort((a, b) => b.p - a.p)[0]?.i ?? -1;
      if (topIdx >= 0) parsed.prediction.total_goals = TTG_LABELS[topIdx];
    }
  }

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
  return { report, hits };
}

/** 为未来 N 小时内开球且还没有报告的比赛批量生成 */
export async function generateUpcomingReports(
  hoursAhead = 48,
  limit = 5,
): Promise<{
  generated: number[];
  failed: Record<number, string>;
  hits: Record<number, string[]>;
}> {
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
  const failed: Record<number, string> = {};
  const hits: Record<number, string[]> = {};
  // 单场失败不影响其余：逐场容错，最多重试一次（应对 AI 偶发的 JSON 异常）
  for (const m of pending) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await generatePreviewReport(m.id);
        generated.push(m.id);
        if (r.hits.length) hits[m.id] = r.hits;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      failed[m.id] = lastErr instanceof Error ? lastErr.message : String(lastErr);
      console.error(`[reports] match=${m.id} 生成失败:`, failed[m.id]);
    }
  }
  return { generated, failed, hits };
}
