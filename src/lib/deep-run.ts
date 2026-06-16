import "server-only";

/**
 * 深度推演。
 * 流程：取结构化数据 + 统计模型结果 → 生成解读 → 合规过滤 → 缓存。
 * 同场同模型只生成一次（model_analyses 全局缓存）。
 *
 * 合规：输出为「赛事分析与不确定性解读」，非预测胜负/荐号；
 * 全字段过禁用词。
 */
import { chatJSONWithModel } from "./ai";
import { filterContent } from "./banned-terms";
import { runDeepModel, type WhlInput } from "./deep-model";
import { getTeamRecentMatches, getH2H } from "./football-data";
import { getModel, type ModelSpec } from "./models";
import { supabaseAdmin } from "./supabase";
import { teamNameZh } from "./team-names";

export interface DeepAnalysis {
  tactical: string; // 战术变量
  personnel: string; // 人员变量
  form: string; // 状态曲线
  odds_read: string; // 赔率结构解读
  upset: string; // 爆冷变量
  summary: string; // 综合推演（中性）
}

const SYSTEM_PROMPT = `你是体育赛事数据分析助手，为「竞彩数据资讯平台」生成单场深度推演解读。
【绝对禁止】不得给出投注建议或倾向（推荐/看好/稳/必胜/必中/跟单/上车/买X/押X/更可能/概率较高等）；
不得承诺准确率/胜率/收益；只做客观描述、对比与不确定性分析。
【任务】基于我给的结构化数据（含统计模型已算出的比分概率），生成中性、专业的解读，严格按 JSON schema 输出，
不要 markdown 包裹，每字段 80-160 字中文，须引用数据中的具体数字。
JSON schema：
{"tactical":"战术变量：双方打法、攻防结构、节奏看点","personnel":"人员变量：关键球员、阵容储备、位置结构","form":"状态曲线：结合本届已有赛果分析近况与不确定性（若有上场数据须引用）","odds_read":"赔率结构：客观描述竞彩官方赔率与统计概率的关系，非建议","upset":"爆冷变量：从排名差、赔率差、本届战绩等角度客观列举可能引发意外结果的因素，不得给出倾向性结论","summary":"综合推演：中性总述，强调足球高度不确定性，非预测胜负"}
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
    upset: clean(a.upset ?? ""),
    summary: clean(a.summary),
  };
}

/** 取双队本届已完赛小组赛战绩 */
async function getGroupResults(
  homeId: number | undefined,
  awayId: number | undefined,
  groupName: string | null,
  beforeMatchId: number,
): Promise<{ home: string[]; away: string[] }> {
  if (!homeId || !awayId || !groupName) return { home: [], away: [] };
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select("id, home_team_id, away_team_id, home_score, away_score, status")
    .eq("group_name", groupName)
    .eq("status", "FINISHED")
    .lt("id", beforeMatchId);
  const fmt = (teamId: number) =>
    (data ?? [])
      .filter((m) => m.home_score !== null && (m.home_team_id === teamId || m.away_team_id === teamId))
      .map((m) => {
        const isHome = m.home_team_id === teamId;
        const gf = isHome ? m.home_score : m.away_score;
        const ga = isHome ? m.away_score : m.home_score;
        const result = gf! > ga! ? "胜" : gf! < ga! ? "负" : "平";
        return `${result} ${gf}-${ga}`;
      });
  return { home: fmt(homeId), away: fmt(awayId) };
}

/** 计算爆冷指数（不展示给用户，只喂给 AI） */
function upsetIndex(
  modelProb: { win: number; draw: number; loss: number },
  homeRank: number | null,
  awayRank: number | null,
): { underdogSide: "home" | "away" | "balanced"; index: number; rankGap: number } {
  const rankGap = homeRank && awayRank ? Math.abs(homeRank - awayRank) : 0;
  // 弱队概率 = 劣势方的胜率
  const favWin = Math.max(modelProb.win, modelProb.loss);
  const underdogWin = Math.min(modelProb.win, modelProb.loss);
  const underdogSide = modelProb.win < modelProb.loss ? "home" : modelProb.win > modelProb.loss ? "away" : "balanced";
  // 爆冷指数：弱队胜率 × 排名差修正（排名差越大，同等胜率下爆冷感更强）
  const rankMult = Math.min(2.0, 1 + rankGap / 50);
  const index = Math.round(underdogWin * rankMult * 100);
  return { underdogSide: underdogSide as "home" | "away" | "balanced", index, rankGap };
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

/** 取双队 FIFA 排名 */
async function getFifaRanks(homeId: number | undefined, awayId: number | undefined): Promise<{ home: number | null; away: number | null }> {
  if (!homeId || !awayId) return { home: null, away: null };
  const db = supabaseAdmin();
  const { data } = await db
    .from("teams")
    .select("id, fifa_rank")
    .in("id", [homeId, awayId]);
  const find = (id: number) => (data ?? []).find((t) => t.id === id)?.fifa_rank ?? null;
  return { home: find(homeId), away: find(awayId) };
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

/** 取该场总进球数（TTG）最新官方赔率，返回 [0球..7+球] 共 8 档 */
const TTG_LABELS = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
async function getTTG(matchId: number): Promise<(number | null)[] | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("odds")
    .select("outcome, odd, captured_at")
    .eq("match_id", matchId)
    .eq("play_type", "totalgoals")
    .order("captured_at", { ascending: false })
    .limit(16);
  if (!data || data.length === 0) return null;
  // 同一档可能有多条（不同抓取时间），取最新——data 已按 captured_at 降序
  const arr = TTG_LABELS.map((label) => {
    const r = data.find((x) => x.outcome === label);
    return r ? Number(r.odd) : null;
  });
  return arr.some((v) => v !== null) ? arr : null;
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

  const [whl, ttg, ranks, groupResults, recentHome, recentAway, h2h] = await Promise.all([
    getWhl(matchId),
    getTTG(matchId),
    getFifaRanks(home?.id, away?.id),
    getGroupResults(home?.id, away?.id, match.group_name, matchId),
    home?.id ? getTeamRecentMatches(home.id, 5) : Promise.resolve([]),
    away?.id ? getTeamRecentMatches(away.id, 5) : Promise.resolve([]),
    getH2H(matchId),
  ]);

  // 近期场均进/失球（供 λ 分配轻度校正）
  const avgGoals = (
    games: Awaited<ReturnType<typeof getTeamRecentMatches>>,
    teamId: number | undefined,
  ): { gf: number; ga: number } | null => {
    if (!teamId || games.length === 0) return null;
    let gf = 0, ga = 0, n = 0;
    for (const m of games) {
      const isHome = m.homeTeam.id === teamId;
      const f = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const a = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      if (f === null || a === null) continue;
      gf += f; ga += a; n++;
    }
    return n > 0 ? { gf: gf / n, ga: ga / n } : null;
  };
  const homeForm = avgGoals(recentHome, home?.id);
  const awayForm = avgGoals(recentAway, away?.id);
  const form = homeForm && awayForm
    ? { homeGF: homeForm.gf, homeGA: homeForm.ga, awayGF: awayForm.gf, awayGA: awayForm.ga }
    : null;

  const model = runDeepModel(whl, ranks.home ?? undefined, ranks.away ?? undefined, ttg, form);
  const upset = upsetIndex(model.modelProb, ranks.home, ranks.away);

  const teamIds = [home?.id, away?.id].filter((x): x is number => typeof x === "number");
  const { data: squads } = teamIds.length
    ? await db
        .from("squads")
        .select("team_id, player_name, position, shirt_number, club")
        .in("team_id", teamIds)
        .limit(60)
    : { data: [] };

  const homeName = teamNameZh(home?.name_en ?? home?.name_zh ?? "");
  const awayName = teamNameZh(away?.name_en ?? away?.name_zh ?? "");

  const userPrompt = `数据如下：${JSON.stringify(
    {
      赛事: "2026 FIFA 世界杯",
      背景: "美加墨联办，东道主自动晋级；除三东道主外均无主场",
      阶段: match.stage,
      主队: homeName,
      客队: awayName,
      FIFA排名: ranks.home && ranks.away
        ? { 主队: `第${ranks.home}位`, 客队: `第${ranks.away}位`, 差距: ranks.home - ranks.away }
        : "暂无",
      本届战绩: groupResults.home.length || groupResults.away.length
        ? { 主队: groupResults.home.length ? groupResults.home : "首场", 客队: groupResults.away.length ? groupResults.away : "首场" }
        : "首轮（无历史战绩）",
      近期状态: {
        主队近5场: recentHome.map((m) => {
          const isHome = m.homeTeam.id === home?.id;
          const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
          const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
          const result = m.score.winner === "DRAW" ? "平" : (isHome ? m.score.winner === "HOME_TEAM" : m.score.winner === "AWAY_TEAM") ? "胜" : "负";
          const opp = isHome ? m.awayTeam.name : m.homeTeam.name;
          return `${result} ${gf}-${ga} vs ${opp}`;
        }),
        客队近5场: recentAway.map((m) => {
          const isHome = m.homeTeam.id === away?.id;
          const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
          const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
          const result = m.score.winner === "DRAW" ? "平" : (isHome ? m.score.winner === "HOME_TEAM" : m.score.winner === "AWAY_TEAM") ? "胜" : "负";
          const opp = isHome ? m.awayTeam.name : m.homeTeam.name;
          return `${result} ${gf}-${ga} vs ${opp}`;
        }),
      },
      历史交锋: h2h ? {
        总场次: h2h.aggregates.numberOfMatches,
        主队胜: h2h.aggregates.homeTeam.wins,
        平: h2h.aggregates.homeTeam.draws,
        客队胜: h2h.aggregates.homeTeam.losses,
        近期对阵: h2h.matches.map((m) => {
          const date = m.utcDate.slice(0, 10);
          return `${date} ${m.homeTeam.name} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.name}`;
        }),
      } : "暂无历史交锋数据",
      爆冷参考: {
        爆冷指数: upset.index,
        弱势方: upset.underdogSide === "home" ? homeName : upset.underdogSide === "away" ? awayName : "势均力敌",
        排名差: upset.rankGap,
        说明: "综合排名差与统计概率计算，数值越高表明弱势方有一定变数空间，非投注倾向",
      },
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

  const raw = await chatJSONWithModel(spec, { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 3000 });
  const analysis = sanitize(parseJson(raw));

  await db
    .from("model_analyses")
    .upsert({ match_id: matchId, model_id: spec.id, content: analysis, generated_at: new Date().toISOString() });

  return analysis;
}

/** 校验模型并返回其规格 */
export function resolveRunnableModel(modelId: string): ModelSpec {
  const spec = getModel(modelId);
  if (spec) return spec;
  // 未知 ID 降级到 deepseek-v3（统一执行通道，保留原始 modelId 作为缓存键）
  const fallback = getModel("deepseek-v3")!;
  return { ...fallback, id: modelId };
}
