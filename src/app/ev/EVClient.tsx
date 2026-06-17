"use client";

import { useState } from "react";
import type { EvMatch, EVResult, EvPick, EvParlay } from "@/lib/ev-engine";
import { analyzeMatches, EV_VALUE, MAX_SINGLE, KELLY_FRACTION } from "@/lib/ev-engine";
import { DISCLAIMER } from "@/lib/odds";

// ── 工具 ───────────────────────────────────────────────────

function pct(x: number, d = 1) { return `${(x * 100).toFixed(d)}%`; }

function evColor(ev: number) {
  if (ev >= 0.15) return "text-neon font-semibold";
  if (ev >= 0.05) return "text-neon/70";
  if (ev <= -0.1) return "text-live";
  return "text-mut";
}

// ── 资金计划（纯客户端，无需引擎） ─────────────────────────

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
        <span className="font-num text-sm text-mut">{pct(parlay.pModel)} 命中</span>
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
          const legs = parlay.legs.map(l => `${l.game.split(" vs ")[0]}·${l.outcome}`).join(" + ");
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
        <div className="flex justify-between text-sm pt-1">
          <span className="text-mut">合计 / 最大回撤</span>
          <span className="font-num">
            <span className="text-ink font-semibold">{plan.totalStake.toFixed(0)} 元</span>
            <span className="text-faint text-xs ml-1">（占本金 {pct(plan.totalStake / bankroll)}）</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-mut">期望盈利</span>
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
  const [result, setResult] = useState<EVResult | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleMatch = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setResult(null);
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === matches.length ? new Set() : new Set(matches.map(m => m.matchId))
    );
    setResult(null);
  };

  const runAnalysis = () => {
    const chosen = matches.filter(m => selected.has(m.matchId));
    if (chosen.length === 0) return;
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      setResult(analyzeMatches(chosen));
      setLoading(false);
    }, 30);
  };

  const valueParlays = result
    ? [...result.parlays2.value, ...result.parlays3.value].slice(0, 5)
    : [];

  if (matches.length === 0) {
    return (
      <div className="card p-6 text-center text-mut text-sm">
        <p>暂无可分析的场次。</p>
        <p className="text-xs text-faint mt-1">需要近期有赔率的未开赛场次，请等待赔率同步。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* 说明条 */}
      <div className="rounded-xl bg-raised/60 border border-line p-4 text-xs text-mut leading-relaxed">
        <strong className="text-ink">工作原理：</strong>
        从亚盘（The Odds API · Pinnacle 锐盘）+ 大小球反解两队期望进球 λ（优先级：亚盘×3 &gt; 大小球×2 &gt; 胜平负×1），
        再用同一套泊松-DC 模型评估体彩赔率——体彩赔率高于模型价值的地方就是 +EV。
        <span className="block mt-0.5 text-faint">无参考盘时自动退回体彩盘自评（标注「体彩盘」）。</span>
      </div>

      {/* 选场 + 运行 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">选择分析场次</h2>
          <button onClick={toggleAll} className="text-xs text-neon hover:text-neon-dim underline underline-offset-2">
            {selected.size === matches.length ? "取消全选" : "全选"}
          </button>
        </div>

        <div className="space-y-2">
          {matches.map(m => {
            const isSelected = selected.has(m.matchId);
            const hasRef = Object.keys(m.refMarkets).length > 0;
            const kickoff = new Date(m.kickoffAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            });
            return (
              <label
                key={m.matchId}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition ${
                  isSelected ? "border-neon/40 bg-neon/[0.03]" : "border-line bg-surface hover:bg-raised/40"
                }`}
              >
                <input
                  type="checkbox" checked={isSelected}
                  onChange={() => toggleMatch(m.matchId)}
                  className="accent-neon w-4 h-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink text-sm">{m.home} vs {m.away}</span>
                    {hasRef
                      ? <span className="chip bg-neon/10 text-neon text-xs">亚盘参考</span>
                      : <span className="chip text-xs text-faint">体彩自评</span>
                    }
                  </div>
                  <span className="text-xs text-faint">
                    {kickoff} · {Object.keys(m.markets).join(" · ")}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
          <span className="text-sm text-mut">已选 <span className="font-num text-ink">{selected.size}</span> 场</span>
          <button
            onClick={runAnalysis}
            disabled={selected.size === 0 || loading}
            className={`px-6 py-2 rounded-full text-sm font-medium transition ${
              selected.size === 0 || loading
                ? "bg-raised text-faint cursor-not-allowed"
                : "bg-neon text-white hover:bg-neon-dim active:scale-95"
            }`}
          >
            {loading ? "计算中…" : "运行分析"}
          </button>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="card p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-neon border-t-transparent rounded-full anim-spin mb-3" />
          <p className="text-sm text-mut">标定 λ · 推导模型概率…</p>
        </div>
      )}

      {/* 结果 */}
      {result && !loading && (
        <div className="space-y-6">

          {/* 速览表 */}
          <section className="card p-5">
            <h2 className="font-semibold text-ink mb-3">场次速览</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
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
          {result.analyses.map(a => (
            <section key={a.match.matchId} className="card p-5 space-y-5">
              <div>
                <h3 className="font-semibold text-ink">{a.match.home} vs {a.match.away}</h3>
                <p className="text-xs text-mut mt-0.5">
                  λ主 <span className="font-num text-ink">{a.lamH.toFixed(2)}</span>
                  {" · "}λ客 <span className="font-num text-ink">{a.lamA.toFixed(2)}</span>
                  {" · "}预期总进球 <span className="font-num text-amber">{(a.lamH + a.lamA).toFixed(2)}</span>
                  {" · "}标定源：{a.calibSource}
                </p>
              </div>
              {a.value.length === 0 && a.stable.length === 0 && a.longshot.length === 0 && (
                <p className="text-sm text-faint">本场无显著偏差点（各玩法 EV 均为负或不显著）</p>
              )}
              <PickTable label="价值档" desc="EV ≥ 10%，正期望 · 主推" picks={a.value} cls="bg-amber/10 text-amber" />
              <PickTable label="稳健档" desc="命中率 ≥ 58%，不等于正期望" picks={a.stable} cls="bg-neon/10 text-neon" />
              <PickTable label="博胆档" desc="冷门赔率 ≥ 5，正期望高方差" picks={a.longshot} cls="bg-live/10 text-live" />
            </section>
          ))}

          {/* 价值串关 */}
          {(result.parlays2.value.length > 0 || result.parlays3.value.length > 0) && (
            <section>
              <h2 className="font-semibold text-ink mb-1">价值串关（全腿 +EV）</h2>
              <p className="text-xs text-mut mb-3">每腿均正期望，串关复利放大优势。混入负 EV 腿贴水被复利吃掉。</p>
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

          {/* 稳健串 */}
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
          {valueParlays.length > 0 && <BankrollPlanner parlays={valueParlays} />}

          {/* 免责声明 */}
          <div className="rounded-xl border border-line/60 p-4 bg-raised/40 text-xs text-faint leading-relaxed">
            <p className="font-medium text-mut mb-1">分析声明</p>
            <p>{DISCLAIMER}</p>
            <p className="mt-1">
              参考盘赔率仅用于引擎内部标定，不展示给用户、不作为投注依据。
              EV 测算基于模型假设，结果取决于赔率质量。本页所有输出<strong>不构成任何投注建议</strong>。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
