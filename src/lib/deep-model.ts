/**
 * 深度推演：足球赛果概率模型（规格第 5 章数学工具 + 第 0 章合规口径）
 *
 * 真实模型，每步独立可调用，供 SSE 路由逐步 emit。管线：
 *   1) 赔率去水位（比例法 de-vig）→ 市场隐含概率
 *   2) 拟合双变量泊松的期望进球 λ_home / λ_away，使其复现市场胜平负
 *   3) Dixon-Coles 低比分修正（rho）
 *   4) 展开为完整比分概率矩阵 → 最可能比分、期望总进球、置信度
 *
 * 【合规】输出为「对不确定性的量化」，非预测胜负；调用方展示时必须带免责声明，
 * 不得据此给出任何投注倾向或「买哪个」的结论。
 */

export interface WhlInput {
  win: number;   // 主胜十进制赔率
  draw: number;
  loss: number;  // 客胜
}

export interface AIAnalysis {
  tactical: string;
  keyFactors: string[];
  modelInsight: string;
  uncertainty: string;
}

export interface DeepModelResult {
  hasOdds: boolean;
  marketProb: { win: number; draw: number; loss: number };
  modelProb: { win: number; draw: number; loss: number };
  expectedGoals: { home: number; away: number };
  topScores: { home: number; away: number; prob: number }[];
  ranges: { bothScore: number; over25: number; under25: number };
  /** 总进球数分布（体彩 TTG 口径）：索引 0..7 = 0球/1球/.../7+球 */
  totalGoals: number[];
  /** 是否用到了总进球赔率做联合拟合 */
  usedTotalGoalsOdds: boolean;
  confidence: number;
  returnRate: number | null;
  steps: { label: string; detail: string }[];
  aiAnalysis: AIAnalysis | null;
}

/** 近期场均进/失球，用于对 λ 分配做轻度校正 */
export interface RecentForm {
  homeGF: number; homeGA: number; awayGF: number; awayGA: number;
}

export const MAX_GOALS = 8;
export const DC_RHO = -0.11;

export function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/** Dixon-Coles 低比分修正因子 */
export function dcTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** 给定 λ，算比分矩阵（含 DC 修正，已归一化） */
export function scoreMatrix(lh: number, la: number): number[][] {
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

export function wdlFromMatrix(m: number[][]): { win: number; draw: number; loss: number } {
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) win += m[i][j];
      else if (i === j) draw += m[i][j];
      else loss += m[i][j];
    }
  return { win, draw, loss };
}

/**
 * 从总进球数（TTG）赔率推导市场期望总进球。
 * ttgOdds: 长度 8，对应 0球/1球/.../7+球 的十进制赔率（含水位）。
 * 去水位归一化后求期望；7+ 档用 7.5 作为保守代表值。
 * 返回 null 表示赔率不全、不可用。
 */
export function totalGoalsExpectation(ttgOdds: (number | null)[]): {
  dist: number[]; expected: number;
} | null {
  if (!ttgOdds || ttgOdds.length < 8) return null;
  const o = ttgOdds.slice(0, 8);
  if (!o.every((v) => typeof v === "number" && Number.isFinite(v) && v > 1)) return null;
  const raw = (o as number[]).map((v) => 1 / v);
  const s = raw.reduce((a, b) => a + b, 0);
  if (s <= 0) return null;
  const dist = raw.map((r) => r / s);
  const reps = [0, 1, 2, 3, 4, 5, 6, 7.5];
  const expected = dist.reduce((acc, p, i) => acc + p * reps[i], 0);
  return { dist, expected };
}

/**
 * 拟合 λ_home / λ_away。
 *
 * - 不给 expectedTotalGoals：在 2D 网格上搜索，使泊松胜平负逼近市场概率（原行为）。
 * - 给 expectedTotalGoals（来自 TTG 赔率）：用「总进球赔率定总量、胜平负赔率定分配」的
 *   解耦拟合——锁定 λ_home + λ_away ≈ 期望总进球，仅搜索进球分配比例 r 去逼近胜平负。
 *   这样比分/进球数分布会同时贴合两个市场，显著提升进球类玩法的准确度。
 */
export function fitLambdas(
  pWin: number,
  pDraw: number,
  expectedTotalGoals?: number | null,
): { lh: number; la: number; err: number } {
  // —— 解耦拟合：TTG 锁总量，胜平负定分配 ——
  if (expectedTotalGoals && expectedTotalGoals > 0.2) {
    const sum = Math.min(6.5, Math.max(0.4, expectedTotalGoals));
    let best = { lh: sum / 2, la: sum / 2, err: Infinity };
    // 粗搜分配比例 r = λ_home / (λ_home + λ_away)
    for (let r = 0.05; r <= 0.95; r += 0.01) {
      const lh = r * sum, la = (1 - r) * sum;
      const w = wdlFromMatrix(scoreMatrix(lh, la));
      const err = (w.win - pWin) ** 2 + (w.draw - pDraw) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
    return best;
  }

  // —— 原行为：仅用胜平负的 2D 网格搜索 ——
  let best = { lh: 1.3, la: 1.1, err: Infinity };
  for (let lh = 0.2; lh <= 3.6; lh += 0.1) {
    for (let la = 0.2; la <= 3.6; la += 0.1) {
      const w = wdlFromMatrix(scoreMatrix(lh, la));
      const err = (w.win - pWin) ** 2 + (w.draw - pDraw) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  for (let lh = best.lh - 0.1; lh <= best.lh + 0.1; lh += 0.02) {
    for (let la = best.la - 0.1; la <= best.la + 0.1; la += 0.02) {
      if (lh <= 0 || la <= 0) continue;
      const w = wdlFromMatrix(scoreMatrix(lh, la));
      const err = (w.win - pWin) ** 2 + (w.draw - pDraw) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  return best;
}

/**
 * 用两队近期场均进/失球，对 λ 的「分配」做轻度校正（保留总量不变）。
 * recent 数据在世界杯样本少、噪声大，故只做小幅 blend（默认 20%）。
 * homeGF/awayGF = 近期场均进球，homeGA/awayGA = 近期场均失球。
 */
export function adjustLambdasByForm(
  lh: number,
  la: number,
  form: { homeGF: number; homeGA: number; awayGF: number; awayGA: number } | null,
  blend = 0.2,
): { lh: number; la: number } {
  if (!form) return { lh, la };
  const { homeGF, homeGA, awayGF, awayGA } = form;
  if (![homeGF, homeGA, awayGF, awayGA].every((v) => Number.isFinite(v) && v >= 0)) {
    return { lh, la };
  }
  const sum = lh + la;
  if (sum <= 0) return { lh, la };
  // 近期视角的进球强度：主队进攻×客队防守、客队进攻×主队防守
  const homeStr = (homeGF + awayGA) / 2;
  const awayStr = (awayGF + homeGA) / 2;
  const strSum = homeStr + awayStr;
  if (strSum <= 0) return { lh, la };
  // 近期分配比例 → 与赔率分配比例 blend，再乘回原总量（总量仍由 TTG/赔率主导）
  const rForm = homeStr / strSum;
  const rOdds = lh / sum;
  const r = rOdds * (1 - blend) + rForm * blend;
  return { lh: r * sum, la: (1 - r) * sum };
}

/**
 * FIFA 排名兜底先验：无赔率时用排名差估算胜平负概率。
 * 用对数排名差 + logistic 函数，避免线性排名的失真。
 * homeRank / awayRank：FIFA 排名（数字越小越强）
 */
export function rankingPrior(homeRank: number, awayRank: number): {
  win: number; draw: number; loss: number;
} {
  // ln(rank) 差：正值代表主队更强
  const lnDiff = Math.log(awayRank) - Math.log(homeRank);
  // logistic 转胜率（斜率 0.9 经验值，大约 ln 差 1.0 ≈ 20% 胜率差）
  const pWin = 1 / (1 + Math.exp(-0.9 * lnDiff));
  // 平局概率：实力越悬殊平局越少，baseline 28%
  const pDraw = 0.28 * Math.max(0.2, 1 - Math.abs(lnDiff) * 0.35);
  const pLoss = Math.max(0.01, 1 - pWin - pDraw);
  // 归一化
  const s = pWin + pDraw + pLoss;
  return { win: pWin / s, draw: pDraw / s, loss: pLoss / s };
}

/** 去水位，返回市场隐含概率和返还率 */
export function deVig(odds: WhlInput): {
  marketProb: { win: number; draw: number; loss: number };
  returnRate: number;
  vig: number;
} {
  const raw = { win: 1 / odds.win, draw: 1 / odds.draw, loss: 1 / odds.loss };
  const s = raw.win + raw.draw + raw.loss;
  const returnRate = 1 / s;
  const vig = (s - 1) / s;
  return {
    marketProb: { win: raw.win / s, draw: raw.draw / s, loss: raw.loss / s },
    returnRate,
    vig,
  };
}

/**
 * 将两个概率分布加权混合（归一化）
 * w1 为 p1 的权重，w2 为 p2 的权重
 */
function blendProb(
  p1: { win: number; draw: number; loss: number },
  w1: number,
  p2: { win: number; draw: number; loss: number },
  w2: number,
): { win: number; draw: number; loss: number } {
  const raw = {
    win: p1.win * w1 + p2.win * w2,
    draw: p1.draw * w1 + p2.draw * w2,
    loss: p1.loss * w1 + p2.loss * w2,
  };
  const s = raw.win + raw.draw + raw.loss;
  return { win: raw.win / s, draw: raw.draw / s, loss: raw.loss / s };
}

/** 向后兼容：一次性运行完整模型（不含 AI 分析） */
export function runDeepModel(
  odds: WhlInput | null,
  homeRank?: number,
  awayRank?: number,
  ttgOdds?: (number | null)[] | null,
  form?: RecentForm | null,
): DeepModelResult {
  const hasOdds = !!odds && [odds.win, odds.draw, odds.loss].every(o => Number.isFinite(o) && o > 1);
  let marketProb = { win: 1 / 3, draw: 1 / 3, loss: 1 / 3 };
  let returnRate: number | null = null;
  const steps: DeepModelResult["steps"] = [];

  // FIFA 排名先验
  const hasRanks = homeRank && awayRank && homeRank > 0 && awayRank > 0;
  const rankPrior = hasRanks ? rankingPrior(homeRank!, awayRank!) : null;

  if (hasOdds && odds) {
    const dv = deVig(odds);
    returnRate = dv.returnRate;
    // 有赔率时：赔率占 85%，FIFA 排名先验占 15%（静默校正，不展示）
    marketProb = rankPrior
      ? blendProb(dv.marketProb, 0.85, rankPrior, 0.15)
      : dv.marketProb;
    steps.push({ label: "去水位", detail: `水位 ${round(dv.vig * 100, 1)}%，返还率 ${round(dv.returnRate * 100, 1)}%` });
  } else if (rankPrior) {
    // 无赔率时：完全用 FIFA 排名先验
    marketProb = rankPrior;
    steps.push({ label: "去水位", detail: "暂无官方赔率，综合历史数据打底" });
  } else {
    steps.push({ label: "去水位", detail: "暂无官方赔率，用中性概率打底" });
  }

  // 总进球赔率 → 期望总进球，做联合拟合（锁总量、定分配）
  const tg = ttgOdds ? totalGoalsExpectation(ttgOdds) : null;
  const usedTotalGoalsOdds = !!tg;
  const fit = fitLambdas(marketProb.win, marketProb.draw, tg?.expected ?? null);
  // 近期状态对分配做轻度校正
  const adj = adjustLambdasByForm(fit.lh, fit.la, form ?? null);
  const lh = adj.lh, la = adj.la;
  steps.push({
    label: "拟合 λ",
    detail: `主队 λ=${round(lh)} / 客队 λ=${round(la)}${tg ? `（联合总进球，期望 ${round(tg.expected, 1)} 球）` : ""}`,
  });
  const matrix = scoreMatrix(lh, la);
  steps.push({ label: "DC 修正", detail: "低比分格子单独校准" });
  const { topScores, ranges, totalGoals, modelProb } = extractRanges(matrix);
  steps.push({ label: "比分矩阵", detail: `最高 ${topScores[0].home}-${topScores[0].away}` });
  const confidence = Math.min(0.99, round(0.5 * Math.max(modelProb.win, modelProb.draw, modelProb.loss) + 0.5 * (topScores[0].prob / 0.18), 2));

  return { hasOdds, marketProb, modelProb, expectedGoals: { home: round(lh), away: round(la) }, topScores, ranges, totalGoals, usedTotalGoalsOdds, confidence, returnRate, steps, aiAnalysis: null };
}

/** 从比分矩阵提取区间概率和 top 比分 */
export function extractRanges(matrix: number[][]): {
  topScores: { home: number; away: number; prob: number }[];
  ranges: { bothScore: number; over25: number; under25: number };
  /** 总进球数分布（体彩 TTG 口径）：索引 0..7 对应 0球/1球/.../7+球 */
  totalGoals: number[];
  modelProb: { win: number; draw: number; loss: number };
} {
  const modelProb = wdlFromMatrix(matrix);
  const flat: { home: number; away: number; prob: number }[] = [];
  const totalGoals = new Array(8).fill(0) as number[];
  let bothScore = 0, over25 = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      flat.push({ home: i, away: j, prob: matrix[i][j] });
      if (i > 0 && j > 0) bothScore += matrix[i][j];
      if (i + j >= 3) over25 += matrix[i][j];
      // 总进球数分档：0..6 各占一档，7 及以上并入「7+球」
      const tg = Math.min(7, i + j);
      totalGoals[tg] += matrix[i][j];
    }
  flat.sort((a, b) => b.prob - a.prob);
  return {
    topScores: flat.slice(0, 6),
    ranges: { bothScore, over25, under25: 1 - over25 },
    totalGoals,
    modelProb,
  };
}
