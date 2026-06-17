"use client";

import { useState, useCallback } from "react";
import type { EvMatch, EVResult, EvPick, EvParlay } from "@/lib/ev-engine";
import { analyzeMatches, EV_VALUE, MAX_SINGLE, KELLY_FRACTION } from "@/lib/ev-engine";
import { DISCLAIMER } from "@/lib/odds";

// ── 工具 ───────────────────────────────────────────────────

function pct(x: number, d = 1) {
  return `${(x * 100).toFixed(d)}%`;
}
function evColor(ev: number) {
  if (ev >= 0.15) return "text-neon font-semibold";
  if (ev >= 0.05) return "text-neon/70";
  if (ev <= -0.1) return "text-live";
  return "text-mut";
}
function numOr(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── 参考盘输入状态 ─────────────────────────────────────────

interface RefState {
  open: boolean;
  spf: { w: string; d: string; l: string };       // 胜平负赔率
  dxq: { line: string; big: string; small: string }; // 大小球
  ab: { line: string; home: string; away: string }; // 亚盘
}

function emptyRef(): RefState {
  return {
    open: false,
    spf: { w: "", d: "", l: "" },
    dxq: { line: "", big: "", small: "" },
    ab: { line: "", home: "", away: "" },
  };
}

/** 把用户填的 RefState 合并进 EvMatch.refMarkets */
function applyRef(match: EvMatch, ref: RefState): EvMatch {
  const rm: Record<string, Record<string, number>> = {};

  const w = numOr(ref.spf.w), d = numOr(ref.spf.d), l = numOr(ref.spf.l);
  if (w && d && l) rm["胜平负"] = { 胜: w, 平: d, 负: l };

  const dLine = parseFloat(ref.dxq.line), big = numOr(ref.dxq.big), small = numOr(ref.dxq.small);
  if (Number.isFinite(dLine) && big && small)
    rm["大小球"] = { line: dLine, 大: big, 小: small };

  const aLine = parseFloat(ref.ab.line), ah = numOr(ref.ab.home), aa = numOr(ref.ab.away);
  if (Number.isFinite(aLine) && ah && aa)
    rm["亚盘"] = { line: aLine, 主: ah, 客: aa };

  return { ...match, refMarkets: rm };
}

// ── 资金计划 ───────────────────────────────────────────────

function kellyCalc(p: number, o: number) {
  const b = o - 1;
  return b > 0 ? Math.max(0, (p * o - 1) / b) : 0;
}
function safeStake(p: number, o: number, bankroll: number) {
  if (o > 8) return bankroll * 0.005;
  return Math.min(bankroll * kellyCalc(p, o) * KELLY_FRACTION, bankroll * MAX_SINGLE);
}
function computePlan(parlays: EvParlay[], bankroll: number) {
  let raw = parlays.filter(p => p.ev > EV_VALUE).slice(0, 5)
    .map(p => ({ parlay: p, stake: safeStake(p.pModel, p.odds, bankroll) }));
  const total = raw.reduce((s, x) => s + x.stake, 0);
  const cap = bankroll * 0.2;
  if (total > cap && total > 0) raw = raw.map(x => ({ ...x, stake: x.stake * cap / total }));
  return {
    entries: raw,
    totalStake: raw.reduce((s, x) => s + x.stake, 0),
    expProfit: raw.reduce((s, x) => s + x.stake * x.parlay.ev, 0),
  };
}

// ── 子组件 ─────────────────────────────────────────────────

function RefInput({ mid, state, onChange }: {
  mid: number;
  state: RefState;
  onChange: (mid: number, s: RefState) => void;
}) {
  const set = (patch: Partial<RefState>) => onChange(mid, { ...state, ...patch });
  const inp = "w-20 border border-line rounded px-2 py-1 text-xs font-num bg-surface focus:outline-none focus:border-neon";

  if (!state.open) {
    return (
      <button
        onClick={() => set({ open: true })}
        className="text-xs text-neon/70 hover:text-neon underline underline-offset-2 mt-1"
      >
        + 添加参考盘赔率
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-xl bg-raised border border-line space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-mut">参考盘（锐盘，仅用于标定真概率）</span>
        <button onClick={() => set({ open: false })} className="text-faint hover:text-mut text-xs">收起</button>
      </div>

      {/* 胜平负 */}
      <div>
        <p className="text-xs text-faint mb-1.5">胜平负赔率（主胜 / 平 / 客胜）</p>
        <div className="flex gap-2">
          <input placeholder="主胜" value={state.spf.w} className={inp}
            onChange={e => set({ spf: { ...state.spf, w: e.target.value } })} />
          <input placeholder="平" value={state.spf.d} className={inp}
            onChange={e => set({ spf: { ...state.spf, d: e.target.value } })} />
          <input placeholder="客胜" value={state.spf.l} className={inp}
            onChange={e => set({ spf: { ...state.spf, l: e.target.value } })} />
        </div>
      </div>

      {/* 大小球 */}
      <div>
        <p className="text-xs text-faint mb-1.5">大小球（盘口 / 大 / 小）</p>
        <div className="flex gap-2">
          <input placeholder="2.5" value={state.dxq.line} className={inp}
            onChange={e => set({ dxq: { ...state.dxq, line: e.target.value } })} />
          <input placeholder="大" value={state.dxq.big} className={inp}
            onChange={e => set({ dxq: { ...state.dxq, big: e.target.value } })} />
          <input placeholder="小" value={state.dxq.small} className={inp}
            onChange={e => set({ dxq: { ...state.dxq, small: e.target.value } })} />
        </div>
      </div>

      {/* 亚盘 */}
      <div>
        <p className="text-xs text-faint mb-1.5">亚盘（让球线 / 主 / 客，让球线如 -0.5）</p>
        <div className="flex gap-2">
          <input placeholder="-0.5" value={state.ab.line} className={inp}
            onChange={e => set({ ab: { ...state.ab, line: e.target.value } })} />
          <input placeholder="主" value={state.ab.home} className={inp}
            onChange={e => set({ ab: { ...state.ab, home: e.target.value } })} />
          <input placeholder="客" value={state.ab.away} className={inp}
            onChange={e => set({ ab: { ...state.ab, away: e.target.value } })} />
        </div>
      </div>

      <p className="text-xs text-faint">填完后点「运行分析」即可。留空的项目引擎自动退回体彩盘标定。</p>
    </div>
  );
}

function PickTable({ picks, label, desc, cls }: {
  picks: EvPick[]; label: string; desc: string; cls: string;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`chip ${cls}`}>{label}</span>
        <span className="text-xs text-mut">{desc}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-xs text-faint border-b border-line">
              <th className="py-1.5 px-2 text-left">玩法</th>
              <th className="py-1.5 px-2 text-left">选项</th>
              <th className="py-1.5 px-2 text-right">赔率</th>
              <th className="py-1.5 px-2 text-right">模型概率</th>
              <th className="py-1.5 px-2 text-right">隐含概率</th>
              <th className="py-1.5 px-2 text-right">优势</th>
              <th className="py-1.5 px-2 text-right">EV</th>
            </tr>
          </thead>
          <tbody>
            {picks.slice(0, 8).map((p, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-raised/40 transition">
                <td className="py-2 px-2 text-xs text-mut">{p.market}</td>
                <td className="py-2 px-2 font-medium text-ink">{p.outcome}</td>
                <td className="py-2 px-2 font-num text-amber text-right">{p.odds.toFixed(2)}</td>
                <td className="py-2 px-2 font-num text-right">{pct(p.pModel)}</td>
                <td className="py-2 px-2 font-num text-right text-mut">{pct(p.pImplied)}</td>
                <td className={`py-2 px-2 font-num text-right ${p.edge >= 0 ? "text-neon/80" : "text-live/70"}`}>
                  {p.edge >= 0 ? "+" : ""}{pct(p.edge)}
                </td>
                <td className={`py-2 px-2 font-num text-right ${evColor(p.ev)}`}>
                  {p.ev >= 0 ? "+" : ""}{pct(p.ev)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParlayCard({ parlay, rank }: { parlay: EvParlay; rank: number }) {
  return (
    <div className="p-3 rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        <span className="text-xs text-mut">#{rank}</span>
        <span className="font-num text-amber text-sm">{parlay.odds.toFixed(2)}x</span>
        <span className="font-num text-sm text-mut">{pct(parlay.pModel)} 命中率</span>
        <span className={`font-num text-sm ${evColor(parlay.ev)}`}>
          EV {parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}
        </span>
        {parlay.allPositive && <span className="chip bg-neon/10 text-neon text-xs">全腿+EV</span>}
      </div>
      <div className="space-y-1 pl-1">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mut">
            <span className="text-faint">└</span>
            <span className="text-ink/80">{leg.game}</span>
            <span>{leg.market}</span>
            <span className="font-medium text-ink">{leg.outcome}</span>
            <span className="font-num text-amber">@{leg.odds.toFixed(2)}</span>
            <span className={`font-num ${evColor(leg.ev)}`}>{leg.ev >= 0 ? "+" : ""}{pct(leg.ev)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BankrollPlanner({ parlays }: { parlays: EvParlay[] }) {
  const [bankroll, setBankroll] = useState(1000);
  const plan = computePlan(parlays, bankroll);

  if (plan.entries.length === 0) return null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">资金分配参考</h3>
        <span className="chip">半凯利 · 敞口≤20%</span>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm text-mut shrink-0">本金（元）</label>
        <input
          type="number" min={100} max={100000} step={100} value={bankroll}
          onChange={e => setBankroll(Math.max(100, Number(e.target.value)))}
          className="border border-line rounded-lg px-3 py-1.5 text-sm font-num w-28 bg-surface focus:outline-none focus:border-neon"
        />
        <input
          type="range" min={100} max={10000} step={100} value={Math.min(bankroll, 10000)}
          onChange={e => setBankroll(Number(e.target.value))}
          className="flex-1 accent-neon"
        />
      </div>
      <div className="space-y-2">
        {plan.entries.map(({ parlay, stake }, i) => {
          const legs = parlay.legs.map(l => {
            const team = l.game.split(" vs ")[0];
            return `${team}·${l.outcome}`;
          }).join(" + ");
          return (
            <div key={i} className="flex items-center justify-between text-sm border-b border-line pb-2 last:border-0">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-mut">注{i + 1}：</span>
                <span className="text-xs text-ink/80 truncate">{legs}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 font-num text-sm ml-3">
                <span className="text-amber">{parlay.odds.toFixed(2)}x</span>
                <span className={evColor(parlay.ev)}>EV {parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}</span>
                <span className="text-neon font-semibold">{stake.toFixed(0)} 元</span>
              </div>
            </div>
          );
        })}
        <div className="flex justify-between text-sm pt-1 text-mut">
          <span>合计 / 最大回撤</span>
          <span className="font-num">
            <span className="text-ink font-semibold">{plan.totalStake.toFixed(0)} 元</span>
            <span className="text-faint text-xs ml-1">（占本金 {pct(plan.totalStake / bankroll)}）</span>
          </span>
        </div>
        <div className="flex justify-between text-sm text-mut">
          <span>期望盈利</span>
          <span className={`font-num ${plan.expProfit >= 0 ? "text-neon" : "text-live"}`}>
            {plan.expProfit >= 0 ? "+" : ""}{plan.expProfit.toFixed(0)} 元
          </span>
        </div>
      </div>
      <p className="text-xs text-faint border-t border-line pt-3">
        半凯利 × 单注上限{(MAX_SINGLE * 100).toFixed(0)}%，总敞口≤20%。金额为数学参考，不构成购彩建议。
      </p>
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────

export default function EVClient({ matches }: { matches: EvMatch[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [refMap, setRefMap] = useState<Record<number, RefState>>({});
  const [result, setResult] = useState<EVResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [legs, setLegs] = useState<2 | 3>(2);

  const toggleMatch = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setResult(null);
  };

  const toggleAll = () => {
    if (selected.size === matches.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(matches.map(m => m.matchId)));
    }
    setResult(null);
  };

  const updateRef = useCallback((mid: number, s: RefState) => {
    setRefMap(prev => ({ ...prev, [mid]: s }));
    setResult(null);
  }, []);

  const runAnalysis = () => {
    const chosen = matches
      .filter(m => selected.has(m.matchId))
      .map(m => applyRef(m, refMap[m.matchId] ?? emptyRef()));

    if (chosen.length === 0) return;
    setLoading(true);
    setResult(null);

    // 让 React 先渲染 loading 状态，再开始密集计算
    setTimeout(() => {
      const r = analyzeMatches(chosen);
      setResult(r);
      setLoading(false);
    }, 30);
  };

  const allValueParlays = result
    ? [...(result.parlays2.value), ...(result.parlays3.value)].slice(0, 5)
    : [];

  if (matches.length === 0) {
    return (
      <div className="card p-6 text-center text-mut text-sm">
        <p>暂无可分析的场次。</p>
        <p className="text-xs text-faint mt-1">需要近期有赔率的未开赛场次，请等待赔率同步后再查看。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── 参考盘说明 ────────────────────────────── */}
      <div className="rounded-xl bg-raised/60 border border-line p-4 text-xs text-mut leading-relaxed">
        <strong className="text-ink">两套盘口原理：</strong>
        体彩盘是下注源；参考盘（Pinnacle / 亚盘）是真概率锚——贴水低、定价专业，
        用来标定λ再反评体彩赔率，体彩赔率高于真概率该有的水平才是真 +EV。
        <span className="block mt-0.5 text-faint">没有参考盘时引擎自动用体彩盘自评（精度受限），可手动填入参考盘赔率提升准确度。</span>
      </div>

      {/* ── 场次选择 ──────────────────────────────── */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">选择分析场次</h2>
          <button
            onClick={toggleAll}
            className="text-xs text-neon hover:text-neon-dim underline underline-offset-2"
          >
            {selected.size === matches.length ? "取消全选" : "全选"}
          </button>
        </div>

        <div className="space-y-3">
          {matches.map(m => {
            const isSelected = selected.has(m.matchId);
            const ref = refMap[m.matchId] ?? emptyRef();
            const hasRef = ref.spf.w || ref.dxq.big || ref.ab.home;
            const kickoff = new Date(m.kickoffAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            });

            return (
              <div
                key={m.matchId}
                className={`rounded-xl border transition ${isSelected ? "border-neon/40 bg-neon/3" : "border-line bg-surface"}`}
              >
                <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={isSelected}
                    onChange={() => toggleMatch(m.matchId)}
                    className="accent-neon w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink text-sm">{m.home} vs {m.away}</span>
                      {hasRef && <span className="chip bg-neon/10 text-neon text-xs">有参考盘</span>}
                    </div>
                    <span className="text-xs text-faint">{kickoff} · 体彩玩法 {Object.keys(m.markets).join(" / ")}</span>
                  </div>
                </label>

                {isSelected && (
                  <div className="px-4 pb-3">
                    <RefInput mid={m.matchId} state={ref} onChange={updateRef} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 串关选项 + 运行按钮 */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-line">
          <div className="flex items-center gap-2">
            <span className="text-sm text-mut">串关</span>
            {([2, 3] as const).map(n => (
              <button
                key={n}
                onClick={() => setLegs(n)}
                className={`chip transition ${legs === n ? "bg-neon/15 text-neon border-neon/30" : ""}`}
              >
                {n} 串 1
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-mut">已选 {selected.size} 场</span>
          <button
            onClick={runAnalysis}
            disabled={selected.size === 0 || loading}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${
              selected.size === 0 || loading
                ? "bg-raised text-faint cursor-not-allowed"
                : "bg-neon text-white hover:bg-neon-dim active:scale-95"
            }`}
          >
            {loading ? "计算中…" : "运行分析"}
          </button>
        </div>
      </section>

      {/* ── 分析结果 ──────────────────────────────── */}
      {loading && (
        <div className="card p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-neon border-t-transparent rounded-full anim-spin mb-3" />
          <p className="text-sm text-mut">正在标定 λ、推导模型概率…</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6">

          {/* 场次速览表 */}
          <section className="card p-5">
            <h2 className="font-semibold text-ink mb-3">场次速览</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-sm">
                <thead>
                  <tr className="text-xs text-faint border-b border-line">
                    <th className="py-2 px-2 text-left">对阵</th>
                    <th className="py-2 px-2 text-left">λ主 / λ客</th>
                    <th className="py-2 px-2 text-left">标定源</th>
                    <th className="py-2 px-2 text-left">最优单注</th>
                    <th className="py-2 px-2 text-right">EV</th>
                  </tr>
                </thead>
                <tbody>
                  {result.analyses.map(a => {
                    const best = a.picks.length ? a.picks.reduce((b, p) => p.ev > b.ev ? p : b) : null;
                    return (
                      <tr key={a.match.matchId} className="border-b border-line last:border-0 hover:bg-raised/40 transition">
                        <td className="py-2.5 px-2 font-medium text-ink">{a.match.home} vs {a.match.away}</td>
                        <td className="py-2.5 px-2 font-num text-xs text-mut">{a.lamH.toFixed(2)} / {a.lamA.toFixed(2)}</td>
                        <td className="py-2.5 px-2">
                          <span className={`chip text-xs ${a.calibSource === "参考盘" ? "bg-neon/10 text-neon" : ""}`}>
                            {a.calibSource}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-mut">
                          {best ? `${best.market}/${best.outcome} @${best.odds.toFixed(2)}` : "—"}
                        </td>
                        <td className={`py-2.5 px-2 font-num text-sm text-right ${best ? evColor(best.ev) : "text-faint"}`}>
                          {best ? `${best.ev >= 0 ? "+" : ""}${pct(best.ev)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 各场三档分析 */}
          {result.analyses.map(a => {
            const hasAny = a.value.length > 0 || a.stable.length > 0 || a.longshot.length > 0;
            return (
              <section key={a.match.matchId} className="card p-5 space-y-5">
                <div>
                  <h3 className="font-semibold text-ink">{a.match.home} vs {a.match.away}</h3>
                  <p className="text-xs text-mut mt-0.5">
                    λ主 <span className="font-num text-ink">{a.lamH.toFixed(2)}</span>
                    {" · "}λ客 <span className="font-num text-ink">{a.lamA.toFixed(2)}</span>
                    {" · "}预期总进球 <span className="font-num text-amber">{(a.lamH + a.lamA).toFixed(2)}</span>
                    {" · 标定源："}{a.calibSource}
                  </p>
                </div>

                {!hasAny && <p className="text-sm text-faint">本场无显著偏差点（各玩法 EV 均为负或不显著）</p>}

                <PickTable label="价值档" desc="EV ≥ 10%，正期望 · 主推" picks={a.value} cls="bg-amber/10 text-amber" />
                <PickTable label="稳健档" desc="命中率 ≥ 58%，不等于正期望" picks={a.stable} cls="bg-neon/10 text-neon" />
                <PickTable label="博胆档" desc="冷门赔率 ≥ 5，正期望高方差" picks={a.longshot} cls="bg-live/10 text-live" />
              </section>
            );
          })}

          {/* 串关推荐 */}
          {(result.parlays2.value.length > 0 || result.parlays3.value.length > 0) && (
            <section>
              <h2 className="font-semibold text-ink mb-1">价值串关（全腿 +EV）</h2>
              <p className="text-xs text-mut mb-3">每腿均正期望时，串关复利放大优势；混入负 EV 腿贴水被复利吃掉。</p>

              {result.parlays2.value.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-mut mb-2">2 串 1</p>
                  <div className="space-y-2">
                    {result.parlays2.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
                  </div>
                </div>
              )}

              {result.parlays3.value.length > 0 && (
                <div>
                  <p className="text-sm text-mut mb-2">3 串 1</p>
                  <div className="space-y-2">
                    {result.parlays3.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 稳健串（参考） */}
          {result.parlays2.stable.length > 0 && (
            <section>
              <h2 className="font-semibold text-ink mb-1">稳健串（命中率优先）</h2>
              <p className="text-xs text-mut mb-3">高命中率优先，注意常含贴水，EV 未必为正。</p>
              <div className="space-y-2">
                {result.parlays2.stable.slice(0, 3).map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
              </div>
            </section>
          )}

          {/* 资金计划 */}
          {allValueParlays.length > 0 && <BankrollPlanner parlays={allValueParlays} />}

          {/* 免责 */}
          <div className="rounded-xl border border-line/60 p-4 bg-raised/40 text-xs text-faint leading-relaxed">
            <p className="font-medium text-mut mb-1">分析声明</p>
            <p>{DISCLAIMER}</p>
            <p className="mt-1">
              EV 引擎仅做概率偏差测算。无参考锐盘时以体彩单一赔率标定，数学上无法"稳赚不赔"（赔率内置贴水）。
              本页所有输出<strong>不构成任何投注建议</strong>。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
