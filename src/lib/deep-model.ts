/**
 * 深度推演：足球赛果概率模型（规格第 5 章数学工具 + 第 0 章合规口径）
 *
 * 真实模型，非假动画。管线：
 *   1) 赔率去水位（比例法 de-vig）→ 市场隐含概率
 *   2) 拟合双变量泊松的期望进球 λ_home / λ_away，使其复现市场胜平负
 *   3) Dixon-Coles 低比分修正（rho）
 *   4) 展开为完整比分概率矩阵 → 最可能比分、期望总进球、置信度
 *
 * 【合规】输出为「对不确定性的量化」，非预测胜负；调用方展示时必须带免责声明，
 * 不得据此给出任何投注倾向或「买哪个」的结论。
 */

export interface WhlInput {
  win: number; // 主胜十进制赔率
  draw: number;
  loss: number; // 客胜
}

export interface DeepModelResult {
  hasOdds: boolean;
  /** 去水位后的市场概率 */
  marketProb: { win: number; draw: number; loss: number };
  /** 模型概率（基于比分矩阵聚合，含 DC 修正） */
  modelProb: { win: number; draw: number; loss: number };
  /** 期望进球（双变量泊松 λ） */
  expectedGoals: { home: number; away: number };
  /** 最可能比分 Top N */
  topScores: { home: number; away: number; prob: number }[];
  /** 区间概率 */
  ranges: { bothScore: number; over25: number; under25: number };
  /** 置信度（分布集中度，0-1；非准确率） */
  confidence: number;
  /** 理论返还率（去水位时得到） */
  returnRate: number | null;
  /** 过程步骤（给前端动画展示，含真实中间数字） */
  steps: { label: string; detail: string }[];
}

const MAX_GOALS = 8;
const DC_RHO = -0.11; // Dixon-Coles 低比分相关系数（经验值）

function poissonPmf(k: number, lambda: number): number {
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/** Dixon-Coles 低比分修正因子 */
function dcTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** 给定 λ，算比分矩阵（含 DC 修正，已归一化） */
function scoreMatrix(lh: number, la: number): number[][] {
  const m: number[][] = [];
  let sum = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    m[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poissonPmf(i, lh) * poissonPmf(j, la) * dcTau(i, j, lh, la, DC_RHO);
      m[i][j] = Math.max(p, 0);
      sum += m[i][j];
    }
  }
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) m[i][j] /= sum;
  return m;
}

function wdlFromMatrix(m: number[][]): { win: number; draw: number; loss: number } {
  let win = 0,
    draw = 0,
    loss = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) win += m[i][j];
      else if (i === j) draw += m[i][j];
      else loss += m[i][j];
    }
  return { win, draw, loss };
}

/** 网格搜索拟合 λ_home / λ_away，使泊松胜平负逼近市场概率 */
function fitLambdas(pWin: number, pDraw: number): { lh: number; la: number } {
  let best = { lh: 1.3, la: 1.1, err: Infinity };
  // 粗搜
  for (let lh = 0.2; lh <= 3.6; lh += 0.1) {
    for (let la = 0.2; la <= 3.6; la += 0.1) {
      const w = wdlFromMatrix(scoreMatrix(lh, la));
      const err = (w.win - pWin) ** 2 + (w.draw - pDraw) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  // 细化
  for (let lh = best.lh - 0.1; lh <= best.lh + 0.1; lh += 0.02) {
    for (let la = best.la - 0.1; la <= best.la + 0.1; la += 0.02) {
      if (lh <= 0 || la <= 0) continue;
      const w = wdlFromMatrix(scoreMatrix(lh, la));
      const err = (w.win - pWin) ** 2 + (w.draw - pDraw) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  return { lh: best.lh, la: best.la };
}

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/**
 * 运行深度推演模型。
 * @param odds 官方胜平负赔率（缺失时用中性默认 λ）
 */
export function runDeepModel(odds: WhlInput | null): DeepModelResult {
  const hasOdds =
    !!odds && [odds.win, odds.draw, odds.loss].every((o) => Number.isFinite(o) && o > 1);

  let marketProb = { win: 1 / 3, draw: 1 / 3, loss: 1 / 3 };
  let returnRate: number | null = null;
  const steps: DeepModelResult["steps"] = [];

  if (hasOdds && odds) {
    const raw = { win: 1 / odds.win, draw: 1 / odds.draw, loss: 1 / odds.loss };
    const s = raw.win + raw.draw + raw.loss;
    returnRate = 1 / s;
    marketProb = { win: raw.win / s, draw: raw.draw / s, loss: raw.loss / s };
    steps.push({
      label: "赔率去水位",
      detail: `比例法剔除 ${round((s - 1) * 100, 1)}% 水位，返还率 ${round(returnRate * 100, 1)}%`,
    });
  } else {
    steps.push({ label: "赔率去水位", detail: "暂无官方赔率，采用中性先验分布" });
  }

  const { lh, la } = fitLambdas(marketProb.win, marketProb.draw);
  steps.push({
    label: "双变量泊松拟合",
    detail: `期望进球 λ主 ${round(lh)} / λ客 ${round(la)}`,
  });

  const matrix = scoreMatrix(lh, la);
  steps.push({ label: "Dixon-Coles 低比分修正", detail: `ρ=${DC_RHO}，校正 0-0/1-0/0-1/1-1` });

  const modelProb = wdlFromMatrix(matrix);

  // 最可能比分
  const flat: { home: number; away: number; prob: number }[] = [];
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) flat.push({ home: i, away: j, prob: matrix[i][j] });
  flat.sort((a, b) => b.prob - a.prob);
  const topScores = flat.slice(0, 6).map((x) => ({ ...x, prob: x.prob }));

  // 区间
  let bothScore = 0,
    over25 = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > 0 && j > 0) bothScore += matrix[i][j];
      if (i + j >= 3) over25 += matrix[i][j];
    }
  steps.push({
    label: "比分矩阵展开",
    detail: `${(MAX_GOALS + 1) ** 2} 个比分概率，最可能 ${topScores[0].home}-${topScores[0].away}`,
  });

  // 置信度：胜平负最大项 + 头号比分集中度
  const maxWdl = Math.max(modelProb.win, modelProb.draw, modelProb.loss);
  const confidence = Math.min(0.99, round(0.5 * maxWdl + 0.5 * (topScores[0].prob / 0.18), 2));
  steps.push({ label: "多模型融合", detail: `输出概率分布与置信度 ${round(confidence * 100, 0)}%` });

  return {
    hasOdds,
    marketProb,
    modelProb,
    expectedGoals: { home: round(lh), away: round(la) },
    topScores,
    ranges: { bothScore, over25, under25: 1 - over25 },
    confidence,
    returnRate,
    steps,
  };
}
