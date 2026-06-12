import "server-only";

/**
 * 深度推演。
 * 流程：取结构化数据 + 统计模型结果 → 生成解读 → 合规过滤 → 缓存。
 * 同场同模型只生成一次（model_analyses 全局缓存）。
 *
 * 合规：输出为「赛事分析与不确定性解读」，非预测胜负/荐号；
 * 全字段过禁用词。
 */
import { chatJSON } from "./ai";
import { filterContent } from "./banned-terms";
import { runDeepModel, type WhlInput } from "./deep-model";
import { getModel, type ModelSpec } from "./models";
import { supabaseAdmin } from "./supabase";
import { teamNameZh } from "./team-names";

export interface DeepAnalysis {
  tactical: string; // 战术变量
  personnel: string; // 人员变量
  form: string; // 状态曲线
  odds_read: string; // 赔率结构解读
  summary: string; // 综合推演（中性）
}

const SYSTEM_PROMPT = `你是体育赛事数据分析助手，为「竞彩数据资讯平台」生成单场深度推演解读。
【绝对禁止】不得给出投注建议或倾向（推荐/看好/稳/必胜/必中/跟单/上车/买X/押X/更可能/概率较高等）；
不得承诺准确率/胜率/收益；只做客观描述、对比与不确定性分析。
【任务】基于我给的结构化数据（含统计模型已算出的比分概率），生成中性、专业的解读，严格按 JSON schema 输出，
不要 markdown 包裹，每字段 80-160 字中文，须引用数据中的具体数字。
JSON schema：
{"tactical":"战术变量：双方打法、攻防结构、节奏看点","personnel":"人员变量：关键球员、阵容储备、位置结构","form":"状态曲线：近况与不确定性","odds_read":"赔率结构：客观描述竞彩官方赔率与统计概率的关系，非建议","summary":"综合推演：中性总述，强调足球高度不确定性，非预测胜负"}
【数据红线】只能用我提供的竞彩赔率，禁止引用境外盘口；不得虚构伤停/首发/历史。`;

interface TeamRef {
  id?: number;
  name_zh?: string;
  name_en?: string | null;
}
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function sanitize(a: DeepAnalysis): DeepAnalysis {
  const clean = (s: string) => filterContent(String(s ?? "")).text;
  return {
    tactical: clean(a.tactical),
    personnel: clean(a.personnel),
    form: clean(a.form),
    odds_read: clean(a.odds_read),
    summary: clean(a.summary),
  };
}

/** 从模型输出里提取第一个完整 JSON 对象 */
function parseJson(raw: string): DeepAnalysis {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    let depth = 0,
      inStr = false,
      esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
    throw new Error("模型返回非 JSON");
  }
}

/** 取该场胜平负最新官方赔率 */
async function getWhl(matchId: number): Promise<WhlInput | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("odds")
    .select("outcome, odd, captured_at")
    .eq("match_id", matchId)
    .eq("play_type", "whl")
    .order("captured_at", { ascending: false })
    .limit(9);
  const pick = (o: string) => {
    const r = (data ?? []).find((x) => x.outcome === o);
    return r ? Number(r.odd) : NaN;
  };
  const win = pick("主胜"),
    draw = pick("平"),
    loss = pick("客胜");
  return [win, draw, loss].every((v) => Number.isFinite(v) && v > 1) ? { win, draw, loss } : null;
}

/** 取或生成某场某模型的深度推演解读（缓存命中直接返回） */
export async function getOrGenerateAnalysis(
  matchId: number,
  spec: ModelSpec,
): Promise<DeepAnalysis> {
  const db = supabaseAdmin();
  const cached = await db
    .from("model_analyses")
    .select("content")
    .eq("match_id", matchId)
    .eq("model_id", spec.id)
    .maybeSingle();
  if (cached.data?.content) return cached.data.content as DeepAnalysis;

  // 取数
  const { data: match } = await db
    .from("matches")
    .select(
      "id, stage, group_name, kickoff_at, home:teams!matches_home_team_id_fkey(id, name_zh, name_en), away:teams!matches_away_team_id_fkey(id, name_zh, name_en)",
    )
    .eq("id", matchId)
    .single();
  if (!match) throw new Error("比赛不存在");
  const home = one(match.home as TeamRef | TeamRef[] | null);
  const away = one(match.away as TeamRef | TeamRef[] | null);

  const whl = await getWhl(matchId);
  const model = runDeepModel(whl);
  const teamIds = [home?.id, away?.id].filter((x): x is number => typeof x === "number");
  const { data: squads } = teamIds.length
    ? await db
        .from("squads")
        .select("team_id, player_name, position, shirt_number, club")
        .in("team_id", teamIds)
        .limit(60)
    : { data: [] };

  const userPrompt = `数据如下：${JSON.stringify(
    {
      赛事: "2026 FIFA 世界杯",
      背景: "美加墨联办，东道主自动晋级；除三东道主外均无主场",
      阶段: match.stage,
      主队: teamNameZh(home?.name_en ?? home?.name_zh ?? ""),
      客队: teamNameZh(away?.name_en ?? away?.name_zh ?? ""),
      统计模型: {
        胜平负概率: {
          主胜: `${(model.modelProb.win * 100).toFixed(1)}%`,
          平: `${(model.modelProb.draw * 100).toFixed(1)}%`,
          客胜: `${(model.modelProb.loss * 100).toFixed(1)}%`,
        },
        期望进球: model.expectedGoals,
        最可能比分: model.topScores.slice(0, 3).map((s) => `${s.home}-${s.away}`),
        置信度: `${(model.confidence * 100).toFixed(0)}%`,
        说明: "由赔率反推+双变量泊松+Dixon-Coles 测算，量化不确定性，非预测胜负",
      },
      竞彩赔率: whl ?? "暂无",
      名单样本: (squads ?? []).slice(0, 40),
    },
    null,
    1,
  )}`;

  const raw = await chatJSON({ system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 3000 });
  const analysis = sanitize(parseJson(raw));

  await db
    .from("model_analyses")
    .upsert({ match_id: matchId, model_id: spec.id, content: analysis, generated_at: new Date().toISOString() });

  return analysis;
}

/** 校验模型并返回其规格 */
export function resolveRunnableModel(modelId: string): ModelSpec {
  const spec = getModel(modelId);
  if (!spec) throw new Error("未知模型");
  return spec;
}
