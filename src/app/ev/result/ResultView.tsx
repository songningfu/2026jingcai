"use client";

import { useMemo, useState } from "react";
import type { EvMatch, EvPick, EvParlay } from "@/lib/ev-engine";
import { analyzeMatches, EV_VALUE, MAX_SINGLE, KELLY_FRACTION } from "@/lib/ev-engine";
import { DISCLAIMER } from "@/lib/odds";

// ── 工具 ───────────────────────────────────────────────────

function pct(x: number, d = 1) { return `${(x * 100).toFixed(d)}%`; }

/** 长期价值(EV) 配色 */
function evColor(ev: number) {
  if (ev >= 0.15) return "text-neon font-semibold";
  if (ev >= 0.05) return "text-neon/70";
  if (ev <= -0.1) return "text-live";
  return "text-mut";
}

/** 命中率 → 风险等级（串关用，直接回答"这方案稳不稳"） */
function hitLevel(p: number): { label: string; cls: string; note: string } {
  if (p >= 0.30) return { label: "命中率较高", cls: "bg-neon/10 text-neon", note: "相对容易兑现" };
  if (p >= 0.08) return { label: "中等命中", cls: "bg-amber/10 text-amber", note: "兑现有难度" };
  return { label: "极低命中 · 波动极大", cls: "bg-live/10 text-live", note: "多数情况会落空，类似彩票" };
}

// ── 资金计划（纯客户端） ───────────────────────────────────

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

// ── 命中率进度条 ────────────────────────────────────────────

function HitBar({ p }: { p: number }) {
  const w = Math.min(100, p * 100);
  const color = p >= 0.5 ? "bg-neon" : p >= 0.2 ? "bg-amber" : "bg-faint";
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="font-num tabular-nums text-ink">{pct(p)}</span>
      <span className="hidden sm:block w-10 h-1.5 rounded-full bg-line overflow-hidden">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </span>
    </div>
  );
}

// ── 单注表 ─────────────────────────────────────────────────

function PickTable({ picks, label, desc, cls }: {
  picks: EvPick[]; label: string; desc: string; cls: string;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`chip ${cls}`}>{label}</span>
        <span className="text-xs text-mut">{desc}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="text-xs text-faint border-b border-line">
              <th className="py-1.5 px-2 text-left">玩法 · 选项</th>
              <th className="py-1.5 px-2 text-right">体彩赔率</th>
              <th className="py-1.5 px-2 text-right">估算命中率</th>
              <th className="py-1.5 px-2 text-right">长期价值</th>
            </tr>
          </thead>
          <tbody>
            {picks.slice(0, 8).map((p, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-raised/40 transition">
                <td className="py-2.5 px-2">
                  <span className="font-medium text-ink">{p.outcome}</span>
                  <span className="text-xs text-faint ml-1.5">{p.market}</span>
                </td>
                <td className="py-2.5 px-2 font-num tabular-nums text-amber text-right">{p.odds.toFixed(2)}</td>
                <td className="py-2.5 px-2 text-right"><HitBar p={p.pModel} /></td>
                <td className={`py-2.5 px-2 font-num tabular-nums text-right ${evColor(p.ev)}`}>
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

// ── 串关卡 ─────────────────────────────────────────────────

function ParlayCard({ parlay, rank }: { parlay: EvParlay; rank: number }) {
  const risk = hitLevel(parlay.pModel);
  return (
    <div className="p-4 rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-1">
        <span className="text-xs text-faint">方案 {rank}</span>
        <span className="font-num tabular-nums text-amber">{parlay.odds.toFixed(2)}<span className="text-xs">倍</span></span>
        <span className="text-sm text-mut">
          命中率 <span className="font-num tabular-nums text-ink">{pct(parlay.pModel)}</span>
        </span>
        <span className={`text-sm ${evColor(parlay.ev)}`}>
          长期价值 <span className="font-num tabular-nums">{parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`chip text-xs ${risk.cls}`}>{risk.label}</span>
        <span className="text-xs text-faint">{risk.note}</span>
      </div>
      <div className="space-y-1.5 pl-1 border-t border-line pt-2.5">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="text-faint">└</span>
            <span className="text-ink/80">{leg.game}</span>
            <span className="text-mut">{leg.market}</span>
            <span className="font-medium text-ink">{leg.outcome}</span>
            <span className="font-num tabular-nums text-amber">{leg.odds.toFixed(2)}倍</span>
            <span className={`font-num tabular-nums ${evColor(leg.ev)}`}>
              {leg.ev >= 0 ? "+" : ""}{pct(leg.ev)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 资金计划 ───────────────────────────────────────────────

function BankrollPlanner({ parlays }: { parlays: EvParlay[] }) {
  const [bankroll, setBankroll] = useState(1000);
  const plan = computePlan(parlays, bankroll);
  if (plan.entries.length === 0) return null;
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">投入金额参考</h3>
        <span className="chip text-xs">已自动封顶单注与总投入</span>
      </div>
      <p className="text-xs text-mut">
        下面金额按数学风控自动算出：单笔最多本金 {(MAX_SINGLE * 100).toFixed(0)}%，全部加起来不超过 20%。仅为参考，非购彩建议。
      </p>
      <div className="flex items-center gap-3">
        <label className="text-sm text-mut shrink-0">本金（元）</label>
        <input
          type="number" min={100} max={100000} step={100} value={bankroll}
          onChange={e => setBankroll(Math.max(100, Number(e.target.value)))}
          className="border border-line rounded-lg px-3 py-1.5 text-sm font-num tabular-nums w-28 bg-surface focus:outline-none focus:border-neon"
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
              <div className="flex items-center gap-3 shrink-0 font-num tabular-nums text-sm ml-3">
                <span className="text-amber">{parlay.odds.toFixed(2)}倍</span>
                <span className="text-neon font-semibold">{stake.toFixed(0)} 元</span>
              </div>
            </div>
          );
        })}
        <div className="flex justify-between text-sm pt-1">
          <span className="text-mut">合计投入</span>
          <span className="font-num tabular-nums">
            <span className="text-ink font-semibold">{plan.totalStake.toFixed(0)} 元</span>
            <span className="text-faint text-xs ml-1">（占本金 {pct(plan.totalStake / bankroll)}）</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-mut">数学期望收益</span>
          <span className={`font-num tabular-nums ${plan.expProfit >= 0 ? "text-neon" : "text-live"}`}>
            {plan.expProfit >= 0 ? "+" : ""}{plan.expProfit.toFixed(0)} 元
          </span>
        </div>
      </div>
      <p className="text-xs text-faint border-t border-line pt-3">
        「期望收益」是数学平均值，不是承诺。单次结果可能全额亏损。
      </p>
    </div>
  );
}

// ── 看懂图例（可折叠） ──────────────────────────────────────

function Legend() {
  return (
    <details className="card p-4 group">
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="font-medium text-ink text-sm">📖 怎么看懂这一页（点开）</span>
        <span className="text-xs text-faint group-open:hidden">展开</span>
        <span className="text-xs text-faint hidden group-open:inline">收起</span>
      </summary>
      <div className="mt-3 pt-3 border-t border-line space-y-2.5 text-xs text-mut leading-relaxed">
        <p><span className="font-medium text-ink">这页在干嘛：</span>用数学模型估算每个玩法的「真实命中率」，再和体彩开出的赔率比——赔率给得比真实水平高的地方，长期看就划算。</p>
        <p><span className="font-medium text-amber">体彩赔率：</span>中国体彩官方开出的赔率，猜中按它翻倍。</p>
        <p><span className="font-medium text-ink">估算命中率：</span>模型算出来的真实发生概率。注意只是估算，不是事实。</p>
        <p>
          <span className="font-medium text-neon">长期价值：</span>赔率相对真实命中率偏高多少。
          <span className="text-neon">正值=划算</span>、负值=贴水亏。但它是「重复很多次的平均」，<span className="text-ink">不保证某一场的结果</span>。
        </p>
        <p className="pt-1 border-t border-line/60">
          <span className="font-medium text-ink">三档怎么分：</span>
          <span className="text-amber">价值档</span>=赔率偏高、长期划算；
          <span className="text-neon">稳健档</span>=命中率高但常含贴水；
          <span className="text-live">博胆档</span>=高赔冷门、押中难、波动大。
        </p>
        <p className="text-faint">⚠️ 长期价值高 ≠ 容易中。高价值常常伴随极低命中率（类似彩票），看的时候两个一起看。</p>
      </div>
    </details>
  );
}

// ── 主组件 ─────────────────────────────────────────────────

export default function ResultView({ matches }: { matches: EvMatch[] }) {
  const result = useMemo(() => analyzeMatches(matches), [matches]);
  const valueParlays = [...result.parlays2.value, ...result.parlays3.value].slice(0, 5);

  return (
    <div className="space-y-6">

      <Legend />

      {/* 速览表 */}
      <section className="card p-5">
        <h2 className="font-semibold text-ink mb-1">① 各场速览</h2>
        <p className="text-xs text-mut mb-3">先看哪场有「划算的点」，再往下看细节。</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-xs text-faint border-b border-line">
                <th className="py-2 px-2 text-left">对阵</th>
                <th className="py-2 px-2 text-center">预期比分</th>
                <th className="py-2 px-2 text-center">划算点</th>
                <th className="py-2 px-2 text-right">最划算选项</th>
              </tr>
            </thead>
            <tbody>
              {result.analyses.map(a => {
                const best = a.value.length ? a.value[0] : null;
                return (
                  <tr key={a.match.matchId} className="border-b border-line last:border-0 hover:bg-raised/40 transition">
                    <td className="py-2.5 px-2 font-medium text-ink">{a.match.home} vs {a.match.away}</td>
                    <td className="py-2.5 px-2 font-num tabular-nums text-xs text-mut text-center">
                      {a.lamH.toFixed(1)} : {a.lamA.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {a.value.length > 0
                        ? <span className="font-num tabular-nums text-amber font-semibold">{a.value.length}</span>
                        : <span className="text-faint">无</span>}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-right">
                      {best
                        ? <span><span className="text-ink font-medium">{best.outcome}</span>
                            <span className="text-faint ml-1">{best.market}</span>
                            <span className={`font-num tabular-nums ml-1.5 ${evColor(best.ev)}`}>+{pct(best.ev)}</span></span>
                        : <span className="text-faint">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint mt-2">「预期比分」是模型估的进球数，非预测结果。「划算点」=该场长期价值为正的选项数量。</p>
      </section>

      {/* 各场三档分析 */}
      <section className="space-y-4">
        <h2 className="font-semibold text-ink">② 每场详细分析</h2>
        {result.analyses.map(a => (
          <div key={a.match.matchId} className="card p-5 space-y-5">
            <div>
              <h3 className="font-semibold text-ink">{a.match.home} vs {a.match.away}</h3>
              <p className="text-xs text-mut mt-0.5">
                模型预期进球 <span className="font-num tabular-nums text-ink">{a.match.home} {a.lamH.toFixed(1)}</span>
                <span className="text-faint"> - </span>
                <span className="font-num tabular-nums text-ink">{a.lamA.toFixed(1)} {a.match.away}</span>
              </p>
            </div>
            {a.value.length === 0 && a.stable.length === 0 && a.longshot.length === 0 && (
              <p className="text-sm text-faint">本场没找到明显划算的点（各玩法赔率都接近或低于估算的真实水平）。</p>
            )}
            <PickTable label="价值档" desc="赔率偏高，长期划算的点" picks={a.value} cls="bg-amber/10 text-amber" />
            <PickTable label="稳健档" desc="命中率高，但常含贴水，不等于划算" picks={a.stable} cls="bg-neon/10 text-neon" />
            <PickTable label="博胆档" desc="高赔冷门，押中难、波动大" picks={a.longshot} cls="bg-live/10 text-live" />
          </div>
        ))}
      </section>

      {/* 价值串关 */}
      {(result.parlays2.value.length > 0 || result.parlays3.value.length > 0) && (
        <section>
          <h2 className="font-semibold text-ink mb-1">③ 价值串关（每腿都划算）</h2>
          <p className="text-xs text-mut mb-3">把多场「划算的点」串在一起，全中才算赢。串得越多赔率越高，但命中率越低——务必看每张卡的风险徽章。</p>
          {result.parlays2.value.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-mut mb-2">两场串一起</p>
              <div className="space-y-2">
                {result.parlays2.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
              </div>
            </div>
          )}
          {result.parlays3.value.length > 0 && (
            <div>
              <p className="text-sm text-mut mb-2">三场串一起</p>
              <div className="space-y-2">
                {result.parlays3.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 高命中串 */}
      {result.parlays2.stable.length > 0 && (
        <section>
          <h2 className="font-semibold text-ink mb-1">④ 高命中串</h2>
          <p className="text-xs text-mut mb-3">优先命中率，相对容易兑现；但常含贴水，长期价值未必为正。</p>
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
          所有数字基于模型假设的数学测算，命中率与价值均为估算、非事实，<strong>不构成任何投注建议，也不承诺任何收益</strong>。
        </p>
      </div>
    </div>
  );
}
