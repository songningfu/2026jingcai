/**
 * 概率计算模块（规格文档第 5 章）
 *
 * 全部为数学换算与组合计算。任何调用方在展示这些结果时，
 * 必须同时展示 DISCLAIMER（第 0 章第 3 条），且不得据此生成任何投注建议文案。
 */

/** 第 0 章第 3 条：所有概率/数据旁的固定免责声明 */
export const DISCLAIMER =
  "概率为赔率反推或模型测算，仅供参考，不代表真实结果。理性购彩，未满18周岁禁止购彩。";

export interface ImpliedResult {
  /** 原始隐含概率 raw_i = 1 / o_i */
  raw: number[];
  /** 归一化后概率 p_i = raw_i / S（去除水位） */
  probs: number[];
  /** 市场总额 S = Σ raw_i（>1，多出部分为返还率损耗） */
  overround: number;
  /** 该玩法理论返还率 = 1 / S */
  returnRate: number;
}

/**
 * 5.1 单场：赔率 → 隐含概率。
 * 要求至少 2 个结果，且所有十进制赔率 > 1；否则返回 null。
 */
export function impliedProbabilities(odds: number[]): ImpliedResult | null {
  if (odds.length < 2 || odds.some((o) => !Number.isFinite(o) || o <= 1)) {
    return null;
  }
  const raw = odds.map((o) => 1 / o);
  const overround = raw.reduce((a, b) => a + b, 0);
  return {
    raw,
    probs: raw.map((r) => r / overround),
    overround,
    returnRate: 1 / overround,
  };
}

/** 5.2 串关总赔率 = 各场所选结果赔率连乘 */
export function parlayOdds(odds: number[]): number {
  return odds.reduce((a, b) => a * b, 1);
}

/** 5.2 理论全中概率 = 各场归一化概率连乘 */
export function parlayProbability(probs: number[]): number {
  return probs.reduce((a, b) => a * b, 1);
}

/** 5.3 组合数 C(n, m)，逐步约分避免溢出 */
export function combinations(n: number, m: number): number {
  if (m < 0 || m > n) return 0;
  if (m === 0 || m === n) return 1;
  const k = Math.min(m, n - m);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/**
 * 「m 串 1」全包时的赔率总和：对 n 场赔率的所有 m 元子集，求各子集赔率乘积之和，
 * 即初等对称多项式 e_m(odds)。全中返奖 = 单注金额 × 该值。
 * 用 DP 计算，O(n·m)。
 */
export function mOfNTotalOdds(odds: number[], m: number): number {
  if (m < 0 || m > odds.length) return 0;
  const e = new Array<number>(m + 1).fill(0);
  e[0] = 1;
  for (const o of odds) {
    for (let j = Math.min(m, odds.length); j >= 1; j--) {
      e[j] += e[j - 1] * o;
    }
  }
  return e[m];
}
