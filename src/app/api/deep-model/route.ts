import { NextRequest } from "next/server";
import {
  deVig, fitLambdas, scoreMatrix, extractRanges, dcTau, round, rankingPrior,
  totalGoalsExpectation,
  type WhlInput, type AIAnalysis,
} from "@/lib/deep-model";
import { FIFA_RANKINGS } from "@/lib/fifa-rankings";
import { chatJSONWithModel } from "@/lib/ai";
import { getModel } from "@/lib/models";
import { filterContent } from "@/lib/banned-terms";
import { supabaseAdmin } from "@/lib/supabase";

const STAGE_ZH: Record<string, string> = {
  group: "小组赛", round32: "1/16决赛", round16: "1/8决赛",
  quarter: "1/4决赛", semi: "半决赛", third: "季军赛", final: "决赛",
};

const AI_SYSTEM = `你是一位足球赛事数据分析师，专注于统计数据的客观解读与赛事特征描述。

严格规则（违反即重写）：
1. 绝对不输出「推荐」「看好」「必中」「稳」「跟单」「上车」「这场买」等任何投注倾向词语
2. 不预测胜负结果，只描述统计规律和不确定性
3. 不承诺任何准确率或收益，不引用境外博彩盘口
4. 所有描述为客观信息，帮助用户理解比赛特点而非指导下注

请以 JSON 格式输出，包含以下字段：
- tactical: 两队战术风格与近期竞技状态的客观描述（≤80字，无预测倾向）
- keyFactors: 影响本场数值分布的3个关键统计因素（字符串数组，每条≤20字）
- modelInsight: 基于泊松模型和赔率数据的统计解读（≤80字，只描述分布特征，不含胜负倾向）
- uncertainty: 本场比赛数值分布的不确定性来源（≤60字）`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 确保某段代码至少执行 minMs 毫秒 */
async function withMinDelay<T>(fn: () => Promise<T>, minMs: number): Promise<T> {
  const [result] = await Promise.all([fn(), sleep(minMs)]);
  return result;
}

/** 根据模型档次返回 AI 步骤的最小等待时长（ms） */
function aiMinDelay(tier: string): number {
  if (tier === "flagship") return 55000; // ~1 分钟
  if (tier === "advanced") return 30000; // ~30 秒
  return 15000;                          // entry ~15 秒
}

export async function POST(req: NextRequest) {
  let matchId: number;
  let modelId: string;
  try {
    const body = await req.json();
    matchId = Number(body.matchId);
    modelId = typeof body.modelId === "string" ? body.modelId : "deepseek-pro";
    if (!Number.isInteger(matchId)) throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "参数错误" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const db = supabaseAdmin();

        const STEP_MIN = 10_000; // 步骤 0-8 最小展示时长（ms）

        // ── 步骤 0：读取官方赔率 ──
        emit({ type: "step", idx: 0, detail: "正在拉取竞彩官方赔率数据…" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rawMatchData0: any = null;
        let odds: WhlInput | null = null;
        let ttgOdds: (number | null)[] | null = null;
        let oddsDetail = "";
        await withMinDelay(async () => {
          const [oRes, tRes, mRes] = await Promise.all([
            db.from("odds")
              .select("outcome, odd, captured_at")
              .eq("match_id", matchId)
              .eq("play_type", "whl")
              .order("captured_at", { ascending: false })
              .limit(9),
            db.from("odds")
              .select("outcome, odd, captured_at")
              .eq("match_id", matchId)
              .eq("play_type", "totalgoals")
              .order("captured_at", { ascending: false })
              .limit(16),
            db.from("matches")
              .select("stage, group_name, home:teams!matches_home_team_id_fkey(id,name_zh), away:teams!matches_away_team_id_fkey(id,name_zh)")
              .eq("id", matchId)
              .single(),
          ]);
          rawMatchData0 = mRes.data;
          if (oRes.data && oRes.data.length >= 3) {
            const pick = (o: string) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const row = (oRes.data as any[]).find((r) => r.outcome === o);
              return row ? Number(row.odd) : NaN;
            };
            const win = pick("主胜"), draw = pick("平"), loss = pick("客胜");
            if ([win, draw, loss].every((v) => Number.isFinite(v) && v > 1)) {
              odds = { win, draw, loss };
            }
          }
          if (tRes.data && tRes.data.length > 0) {
            const ttgLabels = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
            const arr = ttgLabels.map((label) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const row = (tRes.data as any[]).find((r) => r.outcome === label);
              return row ? Number(row.odd) : null;
            });
            if (arr.some((v) => v !== null)) ttgOdds = arr;
          }
          oddsDetail = odds
            ? `胜 ${(odds as WhlInput).win} / 平 ${(odds as WhlInput).draw} / 负 ${(odds as WhlInput).loss}`
            : "暂无官方赔率，使用中性先验";
        }, STEP_MIN);
        const rawMatchData = rawMatchData0;
        emit({ type: "step", idx: 0, done: true, detail: oddsDetail });

        // ── 步骤 1：去水位，还原市场隐含概率 ──
        emit({ type: "step", idx: 1, detail: "执行比例法去水位，提取市场隐含概率…" });
        let marketProb = { win: 1 / 3, draw: 1 / 3, loss: 1 / 3 };
        let returnRate: number | null = null;
        let vigDetail = "";
        await withMinDelay(async () => {
          const matchData0 = rawMatchData;
          const homeRaw0 = matchData0 ? (Array.isArray(matchData0.home) ? matchData0.home[0] : matchData0.home) : null;
          const awayRaw0 = matchData0 ? (Array.isArray(matchData0.away) ? matchData0.away[0] : matchData0.away) : null;
          const homeIdEarly = (homeRaw0 as { id?: number } | null)?.id ?? null;
          const awayIdEarly = (awayRaw0 as { id?: number } | null)?.id ?? null;
          const homeRank = homeIdEarly ? (FIFA_RANKINGS[homeIdEarly] ?? null) : null;
          const awayRank = awayIdEarly ? (FIFA_RANKINGS[awayIdEarly] ?? null) : null;
          if (odds) {
            const dv = deVig(odds);
            marketProb = dv.marketProb;
            returnRate = dv.returnRate;
            vigDetail = `庄口水位 ${round(dv.vig * 100, 1)}% | 理论返还率 ${round(dv.returnRate * 100, 1)}% | 市场隐含概率：主胜 ${round(marketProb.win * 100, 1)}% · 平 ${round(marketProb.draw * 100, 1)}% · 客胜 ${round(marketProb.loss * 100, 1)}%`;
          } else if (homeRank && awayRank) {
            marketProb = rankingPrior(homeRank, awayRank);
            vigDetail = `无竞彩赔率，以 FIFA 排名先验替代（主队第 ${homeRank} 位 / 客队第 ${awayRank} 位）— 隐含概率：主胜 ${round(marketProb.win * 100, 1)}% · 平 ${round(marketProb.draw * 100, 1)}% · 客胜 ${round(marketProb.loss * 100, 1)}%`;
          } else {
            vigDetail = "赔率与排名数据均缺失，采用无信息均匀先验（概率分布仅供参考）";
          }
        }, STEP_MIN);
        emit({ type: "step", idx: 1, done: true, detail: vigDetail });

        // ── 步骤 2：拟合双变量泊松 λ（含总进球联合约束）──
        emit({ type: "step", idx: 2, detail: "网格搜索拟合双变量泊松 λ 参数…" });
        let lh = 0, la = 0, err = 0;
        const tgExp = ttgOdds ? totalGoalsExpectation(ttgOdds) : null;
        await withMinDelay(async () => {
          const fit = fitLambdas(marketProb.win, marketProb.draw, tgExp?.expected ?? null);
          lh = fit.lh; la = fit.la; err = fit.err;
        }, STEP_MIN);
        emit({
          type: "step", idx: 2, done: true,
          detail: `λ主队 = ${round(lh, 3)} · λ客队 = ${round(la, 3)}，期望进球比 ${round(lh, 2)} : ${round(la, 2)}${tgExp ? `；联合总进球赔率约束，期望 ${round(tgExp.expected, 1)} 球` : "，拟合残差 " + err.toFixed(5)}`,
        });

        // ── 步骤 3：Dixon-Coles 低比分修正 ──
        emit({ type: "step", idx: 3, detail: "计算 Dixon-Coles ρ 修正因子，校准低比分格…" });
        let tau00 = 0, tau11 = 0;
        await withMinDelay(async () => {
          tau00 = round(dcTau(0, 0, lh, la, -0.11), 4);
          tau11 = round(dcTau(1, 1, lh, la, -0.11), 4);
        }, STEP_MIN);
        emit({
          type: "step", idx: 3, done: true,
          detail: `低比分格修正系数：0-0 ×${tau00} · 1-1 ×${tau11}；1-0 / 0-1 小幅下调，泊松独立性假设修正完毕`,
        });

        // ── 步骤 4：展开 9×9 比分矩阵 ──
        emit({ type: "step", idx: 4, detail: "展开 9×9 比分联合概率矩阵并归一化…" });
        let topScores: ReturnType<typeof extractRanges>["topScores"] = [];
        let ranges: ReturnType<typeof extractRanges>["ranges"] = { bothScore: 0, over25: 0, under25: 0 };
        let totalGoals: number[] = [];
        let modelProb = { win: 0, draw: 0, loss: 0 };
        await withMinDelay(async () => {
          const matrix = scoreMatrix(lh, la);
          const extracted = extractRanges(matrix);
          topScores = extracted.topScores;
          ranges = extracted.ranges;
          totalGoals = extracted.totalGoals;
          modelProb = extracted.modelProb;
        }, STEP_MIN);
        emit({
          type: "step", idx: 4, done: true,
          detail: `9×9 矩阵归一化完成；最高概率比分 ${topScores[0].home}-${topScores[0].away}（${round(topScores[0].prob * 100, 1)}%），次高 ${topScores[1]?.home ?? "-"}-${topScores[1]?.away ?? "-"}（${round((topScores[1]?.prob ?? 0) * 100, 1)}%）`,
        });

        // ── 步骤 5：聚合赛果与总进球数区间概率 ──
        emit({ type: "step", idx: 5, detail: "聚合胜平负概率、双方进球及总进球数分布…" });
        await sleep(STEP_MIN);
        // 最可能的总进球数档位（体彩 TTG 口径）
        const tgLabels = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
        const tgTop = totalGoals
          .map((p, i) => ({ label: tgLabels[i], prob: p }))
          .sort((a, b) => b.prob - a.prob)[0];
        emit({
          type: "step", idx: 5, done: true,
          detail: `赛果概率：主胜 ${round(modelProb.win * 100, 1)}% · 平局 ${round(modelProb.draw * 100, 1)}% · 客胜 ${round(modelProb.loss * 100, 1)}%；双方进球 ${round(ranges.bothScore * 100, 1)}%；总进球数最可能 ${tgTop?.label ?? "-"}（${round((tgTop?.prob ?? 0) * 100, 1)}%）`,
        });

        // ── 步骤 6：检索历史交锋记录 ──
        emit({ type: "step", idx: 6, detail: "检索世界杯赛史历史交锋记录…" });
        const matchData = rawMatchData;
        const homeTeamRaw = matchData ? (Array.isArray(matchData.home) ? matchData.home[0] : matchData.home) : null;
        const awayTeamRaw = matchData ? (Array.isArray(matchData.away) ? matchData.away[0] : matchData.away) : null;
        const homeName = (homeTeamRaw as { name_zh?: string } | null)?.name_zh ?? "主队";
        const awayName = (awayTeamRaw as { name_zh?: string } | null)?.name_zh ?? "客队";
        const homeId = (homeTeamRaw as { id?: number } | null)?.id ?? null;
        const awayId = (awayTeamRaw as { id?: number } | null)?.id ?? null;

        let h2hDetail = "世界杯赛史中两队尚无直接交锋记录";
        let h2hSummary = "";
        await withMinDelay(async () => {
          if (homeId && awayId) {
            const { data: h2h } = await db.from("team_h2h")
              .select("total_matches, team_a_wins, draws, team_b_wins, summary, team_a_fd_id")
              .or(`and(team_a_fd_id.eq.${homeId},team_b_fd_id.eq.${awayId}),and(team_a_fd_id.eq.${awayId},team_b_fd_id.eq.${homeId})`)
              .limit(1)
              .maybeSingle();
            if (h2h) {
              const homeIsA = h2h.team_a_fd_id === homeId;
              const hw = homeIsA ? h2h.team_a_wins : h2h.team_b_wins;
              const aw = homeIsA ? h2h.team_b_wins : h2h.team_a_wins;
              h2hDetail = `历史 ${h2h.total_matches} 场：${homeName} ${hw} 胜 · 平局 ${h2h.draws} 场 · ${awayName} ${aw} 胜`;
              h2hSummary = h2h.summary ?? "";
            }
          }
        }, STEP_MIN);
        emit({ type: "step", idx: 6, done: true, detail: h2hDetail });

        // ── 步骤 7：交叉验证球队近况数据 ──
        emit({ type: "step", idx: 7, detail: "载入双队球员名单、主帅信息及战术档案…" });
        let squadDetail = "球队数据加载中…";
        await withMinDelay(async () => {
          if (homeId && awayId) {
            const [squadRes, profileRes] = await Promise.all([
              db.from("squads").select("team_id", { count: "exact", head: true }).in("team_id", [homeId, awayId]),
              db.from("team_profiles")
                .select("team_fd_id, coach, style")
                .in("team_fd_id", [homeId, awayId]),
            ]);
            const total = squadRes.count ?? 0;
            const profiles = profileRes.data ?? [];
            const homeProfile = profiles.find(p => p.team_fd_id === homeId);
            const awayProfile = profiles.find(p => p.team_fd_id === awayId);
            squadDetail = `双队合计 ${total} 名球员数据载入完毕`;
            if (homeProfile?.coach) squadDetail += `；${homeName} 主帅：${homeProfile.coach}`;
            if (awayProfile?.coach) squadDetail += `；${awayName} 主帅：${awayProfile.coach}`;
            if (homeProfile?.style || awayProfile?.style) {
              h2hSummary = [
                h2hSummary,
                homeProfile?.style ? `${homeName}战术：${homeProfile.style}` : "",
                awayProfile?.style ? `${awayName}战术：${awayProfile.style}` : "",
              ].filter(Boolean).join("\n");
            }
          }
        }, STEP_MIN);
        emit({ type: "step", idx: 7, done: true, detail: squadDetail });

        // ── 步骤 8：构建 AI 推演上下文 ──
        emit({ type: "step", idx: 8, detail: "整合统计数据与背景信息，构建大模型推演上下文…" });
        const stageZh = STAGE_ZH[matchData?.stage ?? "group"] ?? "小组赛";
        const groupStr = matchData?.group_name ? `${matchData.group_name}组 · ` : "";
        const context = [
          `比赛：${homeName} vs ${awayName}（${groupStr}${stageZh}）`,
          odds
            ? `竞彩赔率：胜${(odds as WhlInput).win} / 平${(odds as WhlInput).draw} / 负${(odds as WhlInput).loss}，水位去除后 主胜${round(marketProb.win * 100, 1)}% / 平${round(marketProb.draw * 100, 1)}% / 客胜${round(marketProb.loss * 100, 1)}%`
            : "暂无官方赔率，使用中性先验",
          `双变量泊松模型：主胜${round(modelProb.win * 100, 1)}% / 平${round(modelProb.draw * 100, 1)}% / 客胜${round(modelProb.loss * 100, 1)}%`,
          `期望进球：主队 λ=${round(lh)} / 客队 λ=${round(la)}`,
          `最高概率比分：${topScores.slice(0, 3).map(s => `${s.home}-${s.away}(${round(s.prob * 100, 1)}%)`).join("、")}`,
          `双方均进球：${round(ranges.bothScore * 100, 1)}%  大于2.5球：${round(ranges.over25 * 100, 1)}%  置信度：${round(Math.min(0.99, 0.5 * Math.max(modelProb.win, modelProb.draw, modelProb.loss) + 0.5 * (topScores[0].prob / 0.18)) * 100, 0)}%`,
          h2hSummary ? `\n补充数据：\n${h2hSummary}` : "",
        ].filter(Boolean).join("\n");
        await sleep(STEP_MIN);
        emit({ type: "step", idx: 8, done: true, detail: `上下文 ${context.length} 字符，含历史交锋与战术档案` });

        // ── 步骤 9：AI 深度推演 ──
        emit({ type: "step", idx: 9, detail: "大模型深度推演运行中，正在生成战术分析报告…" });
        let aiAnalysis: AIAnalysis | null = null;
        try {
          const spec = getModel(modelId) ?? getModel("deepseek-pro")!;
          // 每 10s 发一条 SSE 心跳注释，防止中间网络因无数据而切断连接
          const heartbeatTimer = setInterval(() => {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }, 10_000);
          try {
            await withMinDelay(async () => {
              const raw = await chatJSONWithModel(spec, {
                system: AI_SYSTEM,
                user: context,
                maxTokens: 600,
              });
              const parsed = JSON.parse(raw);
              aiAnalysis = {
                tactical: filterContent(String(parsed.tactical ?? "")).text,
                keyFactors: Array.isArray(parsed.keyFactors)
                  ? parsed.keyFactors.slice(0, 3).map((f: unknown) => filterContent(String(f)).text)
                  : [],
                modelInsight: filterContent(String(parsed.modelInsight ?? "")).text,
                uncertainty: filterContent(String(parsed.uncertainty ?? "")).text,
              };
            }, aiMinDelay(spec.tier));
          } finally {
            clearInterval(heartbeatTimer);
          }
          emit({ type: "step", idx: 9, done: true, detail: "AI 推演完成，分析报告已生成" });
        } catch (aiErr) {
          const aiErrMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
          console.error("[deep-model] AI step failed:", aiErrMsg);
          emit({ type: "step", idx: 9, done: true, detail: `AI 推演失败: ${aiErrMsg.slice(0, 80)}` });
        }

        // ── 步骤 10：融合输出 ──
        emit({ type: "step", idx: 10, detail: "融合统计模型与 AI 推演结果，计算综合置信度…" });
        await sleep(STEP_MIN);
        const confidence = Math.min(0.99, round(
          0.5 * Math.max(modelProb.win, modelProb.draw, modelProb.loss) +
          0.5 * (topScores[0].prob / 0.18), 2,
        ));
        const steps = [
          { label: "读取竞彩官方赔率", detail: oddsDetail },
          { label: "去水位 · 还原市场隐含概率", detail: vigDetail },
          { label: "拟合双变量泊松 λ 参数", detail: `λ主队 = ${round(lh, 3)} · λ客队 = ${round(la, 3)}，拟合残差 ${err.toFixed(5)}` },
          { label: "Dixon-Coles 低比分修正", detail: `0-0 ×${tau00} · 1-1 ×${tau11}` },
          { label: "展开 9×9 比分概率矩阵", detail: `最高概率比分 ${topScores[0].home}-${topScores[0].away}（${round(topScores[0].prob * 100, 1)}%）` },
          { label: "聚合赛果与总进球数概率", detail: `主胜 ${round(modelProb.win * 100, 1)}% · 平 ${round(modelProb.draw * 100, 1)}% · 客胜 ${round(modelProb.loss * 100, 1)}%；双方进球 ${round(ranges.bothScore * 100, 1)}%` },
          { label: "检索世界杯历史交锋记录", detail: h2hDetail },
          { label: "交叉验证球队阵容与近况", detail: squadDetail },
          { label: "构建大模型推演上下文", detail: `上下文 ${context.length} 字符，含历史交锋、战术风格与赔率结构` },
          { label: "大模型深度推演", detail: aiAnalysis ? "推演完成，战术分析报告已生成" : "推演超时，统计模型结果仍然有效" },
          { label: "融合统计与 AI 输出", detail: `模型置信度 ${round(confidence * 100, 0)}%，综合报告就绪` },
        ];
        emit({ type: "step", idx: 10, done: true, detail: `置信度 ${round(confidence * 100, 0)}%，报告已就绪` });

        const result = {
          hasOdds: !!odds,
          marketProb,
          modelProb,
          expectedGoals: { home: round(lh), away: round(la) },
          topScores,
          ranges,
          totalGoals,
          usedTotalGoalsOdds: !!tgExp,
          confidence,
          returnRate,
          steps,
          aiAnalysis,
        };

        emit({ type: "done", result });
      } catch (e) {
        emit({ type: "error", error: e instanceof Error ? e.message : "服务异常" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
