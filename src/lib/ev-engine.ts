/**
 * 竞彩足球 EV 分析引擎（TypeScript 移植）
 *
 * 数学只负责把赔率里的偏差算清楚，不创造优势、不保证盈利。
 * 仅供数学分析参考，不构成任何投注建议。
 */

// ── 常量 ──────────────────────────────────────────────────

const MAXG = 8;
const DC_RHO = -0.13;
const FIRST_HALF_RATIO = 0.45;

const P_STABLE = 0.58;
const EV_STABLE = -0.05;
export const EV_VALUE = 0.10;
const ODDS_LONGSHOT = 5.0;
export const MAX_SINGLE = 0.02;
export const KELLY_FRACTION = 0.5;
const NO_KELLY_ODDS = 8.0;
const LONGSHOT_FLAT = 0.005;

const W_AH = 3.0, W_OU = 2.0, W_1X2 = 1.0;

const POOL_TOP_EV = 4;
const POOL_TOP_P = 2;
const POOL_MIN_P = 0.05;

const RESIDUAL_OUTCOMES = new Set(["其他", "其它", "负其他", "平其他", "胜其他"]);

// ── 类型 ──────────────────────────────────────────────────

export interface EvMatch {
  home: string;
  away: string;
  matchId: number;
  kickoffAt: string;
  /** 体彩盘赔率，格式：markets["胜平负"]["胜"] = 2.05 */
  markets: Record<string, Record<string, number>>;
  /** 参考盘（锐盘）赔率，可选；若有则优先用于标定 λ */
  refMarkets: Record<string, Record<string, number>>;
  /** 外部修正：home_mult / away_mult / home_add / away_add */
  adjust: Record<string, number>;
}

export interface EvPick {
  game: string;
  market: string;
  outcome: string;
  odds: number;
  pModel: number;
  pImplied: number;
  edge: number;
  ev: number;
  kelly: number;
}

export interface EvParlay {
  legs: EvPick[];
  odds: number;
  pModel: number;
  ev: number;
  kelly: number;
  allPositive: boolean;
}

export interface MatchAnalysis {
  match: EvMatch;
  lamH: number;
  lamA: number;
  calibSource: string;
  picks: EvPick[];
  stable: EvPick[];
  value: EvPick[];
  longshot: EvPick[];
  /** 全玩法模型概率（胜平负/大小球等可视化用） */
  mp: Record<string, Record<string, number>>;
  /** 比分概率矩阵 scores[主进球][客进球]（热力图用） */
  scores: number[][];
}

export interface EVResult {
  analyses: MatchAnalysis[];
  parlays2: { stable: EvParlay[]; value: EvParlay[]; longshot: EvParlay[] };
  parlays3: { stable: EvParlay[]; value: EvParlay[]; longshot: EvParlay[] };
  parlays4: { stable: EvParlay[]; value: EvParlay[]; longshot: EvParlay[] };
  /** 系统过关：从 N 腿中取所有 k 腿组合，数组元素为每注方案 */
  systemBets: EvParlay[][];
  generatedAt: string;
}

// ── 核心数学 ───────────────────────────────────────────────

function poisPmf(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let r = Math.exp(-lam);
  for (let i = 0; i < k; i++) r = (r * lam) / (i + 1);
  return r;
}

function dcTau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1.0 - lh * la * rho;
  if (h === 0 && a === 1) return 1.0 + lh * rho;
  if (h === 1 && a === 0) return 1.0 + la * rho;
  if (h === 1 && a === 1) return 1.0 - rho;
  return 1.0;
}

/** Dixon-Coles 修正后的比分网格，flat array 索引 h * MAXG + a */
function scoreGrid(lamH: number, lamA: number, rho = DC_RHO): Float64Array {
  const ph = new Float64Array(MAXG);
  const pa = new Float64Array(MAXG);
  for (let k = 0; k < MAXG; k++) {
    ph[k] = poisPmf(k, lamH);
    pa[k] = poisPmf(k, lamA);
  }
  const g = new Float64Array(MAXG * MAXG);
  let total = 0;
  for (let h = 0; h < MAXG; h++) {
    for (let a = 0; a < MAXG; a++) {
      const v = Math.max(0, ph[h] * pa[a] * dcTau(h, a, lamH, lamA, rho));
      g[h * MAXG + a] = v;
      total += v;
    }
  }
  if (total > 0) for (let i = 0; i < g.length; i++) g[i] /= total;
  return g;
}

export function devig(odds: Record<string, number>): Record<string, number> {
  let sum = 0;
  const inv: Record<string, number> = {};
  for (const [k, v] of Object.entries(odds)) {
    if (typeof v === "number" && v > 1) {
      inv[k] = 1 / v;
      sum += 1 / v;
    }
  }
  if (sum === 0) return {};
  const probs: Record<string, number> = {};
  for (const [k, v] of Object.entries(inv)) probs[k] = v / sum;
  return probs;
}

function evCalc(pTrue: number, odds: number): number {
  return pTrue * odds - 1;
}

function kellyCalc(pTrue: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  return Math.max(0, (pTrue * odds - 1) / b);
}

function ahCoverProb(g: Float64Array, line: number): { ph: number; push: number } {
  let ph = 0, push = 0;
  for (let h = 0; h < MAXG; h++) {
    for (let a = 0; a < MAXG; a++) {
      const d = h - a + line;
      const p = g[h * MAXG + a];
      if (d > 1e-9) ph += p;
      else if (Math.abs(d) < 1e-9) push += p;
    }
  }
  return { ph, push };
}

function frange(lo: number, hi: number, step: number): number[] {
  const r: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) r.push(Math.round(x * 1e4) / 1e4);
  return r;
}

// ── Lambda 标定 ────────────────────────────────────────────

export function calibrateLambdas(match: EvMatch): { lamH: number; lamA: number; source: string } {
  const hasRef = "胜平负" in match.refMarkets;
  const src = hasRef ? match.refMarkets : match.markets;
  const source = hasRef ? "参考盘" : "体彩盘";

  let t1x2: Record<string, number> | null = null;
  if (src["胜平负"]) {
    const m = src["胜平负"];
    if (m["胜"] && m["平"] && m["负"])
      t1x2 = devig({ 胜: m["胜"], 平: m["平"], 负: m["负"] });
  }

  let tOu: number | null = null, tOuLine: number | null = null;
  if (src["大小球"]) {
    const m = src["大小球"];
    if (m["大"] && m["小"]) {
      const pou = devig({ 大: m["大"], 小: m["小"] });
      tOu = pou["大"] ?? null;
      tOuLine = m["line"] ?? 2.5;
    }
  }

  let tAh: number | null = null, tAhLine: number | null = null;
  if (src["亚盘"]) {
    const m = src["亚盘"];
    if (m["主"] && m["客"]) {
      const pah = devig({ 主: m["主"], 客: m["客"] });
      tAh = pah["主"] ?? null;
      tAhLine = m["line"] ?? null;
    }
  }

  if (!t1x2 && tOu === null && tAh === null) {
    return { lamH: 1.3, lamA: 1.0, source };
  }

  let bestErr = Infinity, bestLh = 1.3, bestLa = 1.0;
  const lhRange = frange(0.2, 3.6, 0.05);
  const laRange = frange(0.2, 3.6, 0.05);

  for (const lh of lhRange) {
    for (const la of laRange) {
      const g = scoreGrid(lh, la);
      let err = 0;

      if (t1x2) {
        let ph = 0, pd = 0;
        for (let h = 0; h < MAXG; h++)
          for (let a = 0; a < MAXG; a++) {
            const p = g[h * MAXG + a];
            if (h > a) ph += p;
            else if (h === a) pd += p;
          }
        const pa = 1 - ph - pd;
        err +=
          W_1X2 *
          ((ph - (t1x2["胜"] ?? 0)) ** 2 +
            (pd - (t1x2["平"] ?? 0)) ** 2 +
            (pa - (t1x2["负"] ?? 0)) ** 2);
      }

      if (tOu !== null && tOuLine !== null) {
        let pover = 0;
        for (let h = 0; h < MAXG; h++)
          for (let a = 0; a < MAXG; a++)
            if (h + a > tOuLine) pover += g[h * MAXG + a];
        err += W_OU * (pover - tOu) ** 2;
      }

      if (tAh !== null && tAhLine !== null) {
        const { ph: phc, push } = ahCoverProb(g, tAhLine);
        const pcover = push < 1 ? phc / (1 - push) : phc;
        err += W_AH * (pcover - tAh) ** 2;
      }

      if (err < bestErr) {
        bestErr = err;
        bestLh = lh;
        bestLa = la;
      }
    }
  }

  const adj = match.adjust;
  const lamH = Math.max(0.05, bestLh * (adj["home_mult"] ?? 1) + (adj["home_add"] ?? 0));
  const lamA = Math.max(0.05, bestLa * (adj["away_mult"] ?? 1) + (adj["away_add"] ?? 0));
  return { lamH, lamA, source };
}

// ── 模型概率 ───────────────────────────────────────────────

function halftimeFulltime(lamH: number, lamA: number): Record<string, number> {
  const res: Record<string, number> = {};
  const HG = 6;
  const lh1 = lamH * FIRST_HALF_RATIO, la1 = lamA * FIRST_HALF_RATIO;
  const lh2 = lamH * (1 - FIRST_HALF_RATIO), la2 = lamA * (1 - FIRST_HALF_RATIO);
  const res1 = (h: number, a: number) => (h > a ? "胜" : h === a ? "平" : "负");
  for (let h1 = 0; h1 < HG; h1++)
    for (let a1 = 0; a1 < HG; a1++) {
      const p1 = poisPmf(h1, lh1) * poisPmf(a1, la1);
      const ht = res1(h1, a1);
      for (let h2 = 0; h2 < HG; h2++)
        for (let a2 = 0; a2 < HG; a2++) {
          const p2 = poisPmf(h2, lh2) * poisPmf(a2, la2);
          const key = `${ht}/${res1(h1 + h2, a1 + a2)}`;
          res[key] = (res[key] ?? 0) + p1 * p2;
        }
    }
  return res;
}

export function modelProbs(
  match: EvMatch,
  lamH: number,
  lamA: number,
): Record<string, Record<string, number>> {
  const g = scoreGrid(lamH, lamA);
  const out: Record<string, Record<string, number>> = {};

  const agg = (pred: (h: number, a: number) => boolean): number => {
    let s = 0;
    for (let h = 0; h < MAXG; h++)
      for (let a = 0; a < MAXG; a++)
        if (pred(h, a)) s += g[h * MAXG + a];
    return s;
  };

  if (match.markets["胜平负"]) {
    out["胜平负"] = { 胜: agg((h, a) => h > a), 平: agg((h, a) => h === a), 负: agg((h, a) => h < a) };
  }

  if (match.markets["让球胜平负"]) {
    const L = match.markets["让球胜平负"]["line"] ?? 0;
    out["让球胜平负"] = {
      胜: agg((h, a) => h + L > a),
      平: agg((h, a) => h + L === a),
      负: agg((h, a) => h + L < a),
    };
  }

  if (match.markets["大小球"]) {
    const line = match.markets["大小球"]["line"] ?? 2.5;
    out["大小球"] = { 大: agg((h, a) => h + a > line), 小: agg((h, a) => h + a < line) };
  }

  if (match.markets["双方进球"]) {
    out["双方进球"] = { 是: agg((h, a) => h >= 1 && a >= 1), 否: agg((h, a) => h === 0 || a === 0) };
  }

  if (match.markets["总进球"]) {
    const tg: Record<string, number> = {};
    for (const key of Object.keys(match.markets["总进球"])) {
      if (key === "line") continue;
      if (key.endsWith("+")) {
        const n = parseInt(key);
        tg[key] = agg((h, a) => h + a >= n);
      } else {
        const n = parseInt(key);
        tg[key] = agg((h, a) => h + a === n);
      }
    }
    out["总进球"] = tg;
  }

  if (match.markets["比分"]) {
    const cs: Record<string, number> = {};
    let listed = 0;
    for (const key of Object.keys(match.markets["比分"])) {
      if (key === "其他" || key === "line") continue;
      const parts = key.split(":");
      if (parts.length !== 2) continue;
      const hh = parseInt(parts[0]), aa = parseInt(parts[1]);
      if (Number.isNaN(hh) || Number.isNaN(aa)) continue;
      if (hh >= MAXG || aa >= MAXG) { cs[key] = 0; continue; }
      const p = g[hh * MAXG + aa];
      cs[key] = p;
      listed += p;
    }
    if ("其他" in match.markets["比分"]) cs["其他"] = Math.max(0, 1 - listed);
    out["比分"] = cs;
  }

  if (match.markets["半全场"]) {
    out["半全场"] = halftimeFulltime(lamH, lamA);
  }

  return out;
}

/** 比分概率矩阵 out[主进球][客进球]=P(该比分)，size 球以内，供热力图展示 */
export function scoreMatrix(lamH: number, lamA: number, size = 6): number[][] {
  const g = scoreGrid(lamH, lamA);
  const out: number[][] = [];
  for (let h = 0; h < size; h++) {
    const row: number[] = [];
    for (let a = 0; a < size; a++) row.push(g[h * MAXG + a]);
    out.push(row);
  }
  return out;
}

// ── 推荐器 ─────────────────────────────────────────────────

export function buildPicks(
  match: EvMatch,
  mp: Record<string, Record<string, number>>,
): EvPick[] {
  const picks: EvPick[] = [];
  const game = `${match.home} vs ${match.away}`;

  for (const [mname, outcomes] of Object.entries(match.markets)) {
    const probs = mp[mname];
    if (!probs) continue;
    for (const [oc, odds] of Object.entries(outcomes)) {
      if (typeof odds !== "number" || oc === "line") continue;
      if (RESIDUAL_OUTCOMES.has(oc)) continue;
      const pm = probs[oc];
      if (pm === undefined || pm <= 0) continue;
      const pi = 1 / odds;
      picks.push({
        game, market: mname, outcome: oc, odds,
        pModel: pm, pImplied: pi, edge: pm - pi,
        ev: evCalc(pm, odds), kelly: kellyCalc(pm, odds),
      });
    }
  }
  return picks;
}

export function classify(picks: EvPick[]): { stable: EvPick[]; value: EvPick[]; longshot: EvPick[] } {
  const stable: EvPick[] = [], value: EvPick[] = [], longshot: EvPick[] = [];
  for (const p of picks) {
    if (p.pModel >= P_STABLE && p.ev >= EV_STABLE) stable.push(p);
    else if (p.ev >= EV_VALUE && p.pModel >= 0.12 && p.pModel <= 0.78) value.push(p);
    else if (p.odds >= ODDS_LONGSHOT && p.ev > 0) longshot.push(p);
  }
  stable.sort((a, b) => b.pModel - a.pModel || b.ev - a.ev);
  value.sort((a, b) => b.ev - a.ev);
  longshot.sort((a, b) => b.ev - a.ev);
  return { stable, value, longshot };
}

function candidatePool(match: EvMatch): EvPick[] {
  const { lamH, lamA } = calibrateLambdas(match);
  const mp = modelProbs(match, lamH, lamA);
  const picks = buildPicks(match, mp).filter((p) => p.pModel >= POOL_MIN_P);
  const byEv = [...picks].sort((a, b) => b.ev - a.ev).slice(0, POOL_TOP_EV);
  const byP = [...picks].sort((a, b) => b.pModel - a.pModel).slice(0, POOL_TOP_P);
  const pool: EvPick[] = [];
  const seen = new Set<string>();
  for (const p of [...byEv, ...byP]) {
    const key = `${p.market}|${p.outcome}`;
    if (!seen.has(key)) { seen.add(key); pool.push(p); }
  }
  return pool;
}

// ── 串关引擎 ───────────────────────────────────────────────

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++)
    for (const rest of combinations(arr.slice(i + 1), k - 1))
      yield [arr[i], ...rest];
}

function* cartesian<T>(pools: T[][]): Generator<T[]> {
  if (pools.length === 0) { yield []; return; }
  for (const rest of cartesian(pools.slice(1)))
    for (const item of pools[0])
      yield [item, ...rest];
}

export function enumerateParlays(matches: EvMatch[], legs: number): EvParlay[] {
  if (matches.length < legs) return [];
  const pools = matches.map((m) => candidatePool(m));
  const results: EvParlay[] = [];

  for (const combo of combinations(matches.map((_, i) => i), legs)) {
    for (const selection of cartesian(combo.map((i) => pools[i]))) {
      let odds = 1, p = 1, allPos = true;
      for (const leg of selection) {
        odds *= leg.odds;
        p *= leg.pModel;
        if (leg.ev <= 0) allPos = false;
      }
      results.push({
        legs: selection, odds, pModel: p,
        ev: p * odds - 1, kelly: kellyCalc(p, odds), allPositive: allPos,
      });
    }
  }
  return results;
}

export function classifyParlays(
  parlays: EvParlay[],
  topN = 5,
): { stable: EvParlay[]; value: EvParlay[]; longshot: EvParlay[] } {
  return {
    stable: parlays.filter((x) => x.ev >= -0.15).sort((a, b) => b.pModel - a.pModel).slice(0, topN),
    value: parlays.filter((x) => x.allPositive && x.ev > 0).sort((a, b) => b.ev - a.ev).slice(0, topN),
    longshot: parlays.filter((x) => x.ev > 0).sort((a, b) => b.odds - a.odds).slice(0, topN),
  };
}

// ── 资金分配 ───────────────────────────────────────────────

function safeStake(pModel: number, odds: number, bankroll: number): number {
  if (odds > NO_KELLY_ODDS) return bankroll * LONGSHOT_FLAT;
  const raw = bankroll * kellyCalc(pModel, odds) * KELLY_FRACTION;
  return Math.min(raw, bankroll * MAX_SINGLE);
}

export function bankrollPlan(
  parlays: EvParlay[],
  bankroll: number,
): { entries: Array<{ parlay: EvParlay; stake: number }>; totalStake: number; expProfit: number } {
  const chosen = parlays.filter((p) => p.ev > EV_VALUE).slice(0, 5);
  let raw = chosen.map((p) => ({ parlay: p, stake: safeStake(p.pModel, p.odds, bankroll) }));
  const total = raw.reduce((s, x) => s + x.stake, 0);
  const cap = bankroll * 0.2;
  if (total > cap && total > 0) raw = raw.map((x) => ({ ...x, stake: (x.stake * cap) / total }));
  const totalStake = raw.reduce((s, x) => s + x.stake, 0);
  const expProfit = raw.reduce((s, x) => s + x.stake * x.parlay.ev, 0);
  return { entries: raw, totalStake, expProfit };
}

// ── 主分析入口 ─────────────────────────────────────────────

/**
 * 系统过关：从每场最佳单注中选出 topLegs 腿，生成所有 legSize 腿的组合
 * 例: 3串3 = topLegs=3 legSize=2 → C(3,2)=3 注
 */
export function buildSystemBets(
  matches: EvMatch[],
  topLegs = 4,
  legSize = 2,
): EvParlay[] {
  // 每场只取最佳 EV 单注
  const bestPerMatch: EvPick[] = [];
  for (const m of matches) {
    const pool = candidatePool(m);
    if (pool.length === 0) continue;
    const best = pool.sort((a, b) => b.ev - a.ev)[0];
    bestPerMatch.push(best);
  }
  if (bestPerMatch.length < legSize) return [];
  const top = bestPerMatch.slice(0, topLegs);
  const results: EvParlay[] = [];
  for (const combo of combinations(top, legSize)) {
    let odds = 1, p = 1, allPos = true;
    for (const leg of combo) {
      odds *= leg.odds;
      p *= leg.pModel;
      if (leg.ev <= 0) allPos = false;
    }
    results.push({ legs: combo, odds, pModel: p, ev: p * odds - 1, kelly: kellyCalc(p, odds), allPositive: allPos });
  }
  return results.sort((a, b) => b.ev - a.ev);
}

export function analyzeMatches(matches: EvMatch[]): EVResult {
  const analyses: MatchAnalysis[] = [];

  for (const match of matches) {
    const { lamH, lamA, source } = calibrateLambdas(match);
    const mp = modelProbs(match, lamH, lamA);
    const picks = buildPicks(match, mp);
    const { stable, value, longshot } = classify(picks);
    const scores = scoreMatrix(lamH, lamA, 6);
    analyses.push({ match, lamH, lamA, calibSource: source, picks, stable, value, longshot, mp, scores });
  }

  const parlays2 = classifyParlays(enumerateParlays(matches, 2));
  const parlays3 = matches.length >= 3 ? classifyParlays(enumerateParlays(matches, 3)) : { stable: [], value: [], longshot: [] };
  const parlays4 = matches.length >= 4 ? classifyParlays(enumerateParlays(matches, 4)) : { stable: [], value: [], longshot: [] };

  // 系统过关：从前4场各取最佳一腿，生成所有2腿组合（如 4串6 取2腿的情况）
  const systemBets: EvParlay[][] = [];
  if (matches.length >= 3) {
    // 3串3：3腿各取最佳，生成C(3,2)=3注二串 + 1注三串
    const sys3 = [
      ...buildSystemBets(matches, 3, 2),
      ...buildSystemBets(matches, 3, 3),
    ];
    if (sys3.length) systemBets.push(sys3);
  }
  if (matches.length >= 4) {
    // 4串11：4腿各取最佳，生成C(4,2)+C(4,3)+C(4,4) = 11注
    const sys4 = [
      ...buildSystemBets(matches, 4, 2),
      ...buildSystemBets(matches, 4, 3),
      ...buildSystemBets(matches, 4, 4),
    ];
    if (sys4.length) systemBets.push(sys4);
  }

  return { analyses, parlays2, parlays3, parlays4, systemBets, generatedAt: new Date().toISOString() };
}
