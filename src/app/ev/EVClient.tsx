"use client";

import { useState } from "react";
import type { EVResult, EvParlay, EvPick } from "@/lib/ev-engine";
import { EV_VALUE, MAX_SINGLE, KELLY_FRACTION } from "@/lib/ev-engine";
import { DISCLAIMER } from "@/lib/odds";

// ── 工具函数 ───────────────────────────────────────────────

function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

function evColor(ev: number): string {
  if (ev >= 0.15) return "text-neon font-semibold";
  if (ev >= 0.05) return "text-neon/80";
  if (ev <= -0.1) return "text-live";
  return "text-mut";
}

function tierBadge(tier: "stable" | "value" | "longshot") {
  const map = {
    stable: { label: "稳健", cls: "bg-neon/10 text-neon" },
    value: { label: "价值", cls: "bg-amber/10 text-amber" },
    longshot: { label: "博胆", cls: "bg-live/10 text-live" },
  };
  return map[tier];
}

// ── 客户端资金计划计算 ────────────────────────────────────

function safeStake(pModel: number, odds: number, bankroll: number): number {
  const NO_KELLY_ODDS = 8.0;
  const LONGSHOT_FLAT = 0.005;
  if (odds > NO_KELLY_ODDS) return bankroll * LONGSHOT_FLAT;
  const b = odds - 1;
  const k = b > 0 ? Math.max(0, (pModel * odds - 1) / b) : 0;
  const raw = bankroll * k * KELLY_FRACTION;
  return Math.min(raw, bankroll * MAX_SINGLE);
}

function computePlan(parlays: EvParlay[], bankroll: number) {
  const chosen = parlays.filter((p) => p.ev > EV_VALUE).slice(0, 5);
  let raw = chosen.map((p) => ({ parlay: p, stake: safeStake(p.pModel, p.odds, bankroll) }));
  const total = raw.reduce((s, x) => s + x.stake, 0);
  const cap = bankroll * 0.2;
  if (total > cap && total > 0) raw = raw.map((x) => ({ ...x, stake: (x.stake * cap) / total }));
  const totalStake = raw.reduce((s, x) => s + x.stake, 0);
  const expProfit = raw.reduce((s, x) => s + x.stake * x.parlay.ev, 0);
  return { entries: raw, totalStake, expProfit };
}

// ── 子组件 ─────────────────────────────────────────────────

function PickRow({ p, rank }: { p: EvPick; rank: number }) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-raised/50 transition">
      <td className="py-2 px-3 text-faint font-num text-xs">{rank}</td>
      <td className="py-2 px-3 text-xs text-mut">{p.market}</td>
      <td className="py-2 px-3 font-medium text-ink text-sm">{p.outcome}</td>
      <td className="py-2 px-3 font-num text-amber text-sm text-right">{p.odds.toFixed(2)}</td>
      <td className="py-2 px-3 font-num text-sm text-right">{pct(p.pModel)}</td>
      <td className="py-2 px-3 font-num text-sm text-right">{pct(p.pImplied)}</td>
      <td className={`py-2 px-3 font-num text-sm text-right ${evColor(p.ev)}`}>
        {p.ev >= 0 ? "+" : ""}{pct(p.ev)}
      </td>
    </tr>
  );
}

function TierSection({
  label,
  desc,
  picks,
  cls,
}: {
  label: string;
  desc: string;
  picks: EvPick[];
  cls: string;
}) {
  if (picks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`chip ${cls}`}>{label}</span>
        <span className="text-xs text-mut">{desc}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-xs text-faint border-b border-line">
              <th className="py-1.5 px-3 text-left">#</th>
              <th className="py-1.5 px-3 text-left">玩法</th>
              <th className="py-1.5 px-3 text-left">选项</th>
              <th className="py-1.5 px-3 text-right">赔率</th>
              <th className="py-1.5 px-3 text-right">模型概率</th>
              <th className="py-1.5 px-3 text-right">隐含概率</th>
              <th className="py-1.5 px-3 text-right">EV</th>
            </tr>
          </thead>
          <tbody>
            {picks.slice(0, 8).map((p, i) => (
              <PickRow key={`${p.market}-${p.outcome}`} p={p} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParlayCard({ parlay, rank }: { parlay: EvParlay; rank: number }) {
  return (
    <div className="p-3 rounded-xl border border-line bg-surface hover:bg-raised/50 transition">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-mut">#{rank}</span>
        <div className="flex items-center gap-3 font-num text-sm">
          <span className="text-amber">{parlay.odds.toFixed(2)}x</span>
          <span className="text-mut">{pct(parlay.pModel)} 命中</span>
          <span className={evColor(parlay.ev)}>EV {parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}</span>
          {parlay.allPositive && (
            <span className="chip bg-neon/10 text-neon">全腿+EV</span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-mut pl-1">
            <span className="text-faint">└</span>
            <span className="text-ink/70">{leg.game.split(" vs ").map((t, j) => (
              <span key={j}>{j > 0 ? <span className="text-faint mx-0.5">vs</span> : null}{t}</span>
            ))}</span>
            <span className="text-mut">{leg.market}</span>
            <span className="font-medium text-ink">{leg.outcome}</span>
            <span className="text-amber font-num">@{leg.odds.toFixed(2)}</span>
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

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">资金分配参考</h3>
        <span className="chip">半凯利 · 总敞口≤20%</span>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-mut shrink-0">本金（元）</label>
        <input
          type="number"
          min={100}
          max={100000}
          step={100}
          value={bankroll}
          onChange={(e) => setBankroll(Math.max(100, Number(e.target.value)))}
          className="border border-line rounded-lg px-3 py-1.5 text-sm font-num w-32 bg-surface focus:outline-none focus:border-neon"
        />
        <input
          type="range"
          min={100}
          max={10000}
          step={100}
          value={Math.min(bankroll, 10000)}
          onChange={(e) => setBankroll(Number(e.target.value))}
          className="flex-1 accent-neon"
        />
      </div>

      {plan.entries.length === 0 ? (
        <p className="text-sm text-mut">当前无 EV≥10% 的串关组合，建议观望。</p>
      ) : (
        <div className="space-y-2">
          {plan.entries.map(({ parlay, stake }, i) => {
            const legs = parlay.legs.map((l) => `${l.game.split(" vs ")[0]}${l.outcome}`).join(" + ");
            return (
              <div key={i} className="flex items-center justify-between text-sm border-b border-line pb-2 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-mut text-xs">注{i + 1}：</span>
                  <span className="text-ink text-xs truncate">{legs}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 font-num text-sm">
                  <span className="text-amber">{parlay.odds.toFixed(2)}x</span>
                  <span className={`font-semibold ${evColor(parlay.ev)}`}>EV {parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}</span>
                  <span className="text-neon font-semibold">下 {stake.toFixed(0)} 元</span>
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-sm pt-1">
            <span className="text-mut">合计下注</span>
            <span className="font-num font-semibold text-ink">{plan.totalStake.toFixed(0)} 元</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-mut">最大回撤（全输）</span>
            <span className="font-num text-live">−{plan.totalStake.toFixed(0)} 元（占本金 {pct(plan.totalStake / bankroll, 1)}）</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-mut">期望盈利</span>
            <span className={`font-num ${plan.expProfit >= 0 ? "text-neon" : "text-live"}`}>
              {plan.expProfit >= 0 ? "+" : ""}{plan.expProfit.toFixed(0)} 元
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-faint border-t border-line pt-3">
        按分数凯利（半凯利）× 单注上限 {(MAX_SINGLE * 100).toFixed(0)}% 计算，总敞口≤20%。金额仅供数学参考，不构成购彩建议。
      </p>
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────

export default function EVClient({ result }: { result: EVResult }) {
  const { analyses, parlays2, parlays3 } = result;
  const [activeMatch, setActiveMatch] = useState<number | null>(null);

  const allValueParlays = [
    ...parlays2.value,
    ...(parlays2.value.length < 3 ? parlays3.value : []),
  ];

  return (
    <div className="space-y-8">
      {/* 概率说明 */}
      <div className="rounded-xl bg-raised/60 border border-line p-4 text-xs text-mut leading-relaxed">
        <strong className="text-ink">数学原理：</strong>从胜平负 + 让球 + 大小球赔率反解两队期望进球 λ（Dixon-Coles 修正），
        再自洽推导比分/总进球等玩法的模型概率，与实际赔率比价找偏差（EV = 模型概率 × 赔率 − 1）。
        <span className="block mt-1">仅用中国体彩竞彩官方赔率，无参考锐盘时以体彩自身标定，精度受限。</span>
      </div>

      {/* ── 场次速览 ────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">场次速览</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-xs text-faint border-b border-line">
                <th className="py-2 px-3 text-left">对阵</th>
                <th className="py-2 px-3 text-left">λ主/λ客</th>
                <th className="py-2 px-3 text-left">标定源</th>
                <th className="py-2 px-3 text-left">最优单注</th>
                <th className="py-2 px-3 text-right">EV</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => {
                const best = a.picks.length > 0 ? a.picks.reduce((b, p) => (p.ev > b.ev ? p : b)) : null;
                const isActive = activeMatch === a.match.matchId;
                return (
                  <tr
                    key={a.match.matchId}
                    className={`border-b border-line cursor-pointer transition ${isActive ? "bg-neon/5" : "hover:bg-raised/50"}`}
                    onClick={() => setActiveMatch(isActive ? null : a.match.matchId)}
                  >
                    <td className="py-2.5 px-3 font-medium text-ink">{a.match.home} vs {a.match.away}</td>
                    <td className="py-2.5 px-3 font-num text-xs text-mut">{a.lamH.toFixed(2)} / {a.lamA.toFixed(2)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`chip text-xs ${a.calibSource === "参考盘" ? "bg-neon/10 text-neon" : ""}`}>{a.calibSource}</span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-mut">
                      {best ? `${best.market}/${best.outcome} @${best.odds.toFixed(2)}` : "—"}
                    </td>
                    <td className={`py-2.5 px-3 font-num text-sm text-right ${best ? evColor(best.ev) : "text-faint"}`}>
                      {best ? `${best.ev >= 0 ? "+" : ""}${pct(best.ev)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint mt-2">点击行展开该场三档分析</p>
      </section>

      {/* ── 展开场次分析 ─────────────────── */}
      {analyses
        .filter((a) => activeMatch === null || activeMatch === a.match.matchId)
        .map((a) => {
          if (activeMatch === null && a.value.length === 0 && a.stable.length === 0 && a.longshot.length === 0)
            return null;
          return (
            <section key={a.match.matchId} className="card p-5 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-ink">{a.match.home} vs {a.match.away}</h3>
                  <p className="text-xs text-mut mt-0.5">
                    λ主 <span className="font-num text-ink">{a.lamH.toFixed(2)}</span>
                    {" · "}λ客 <span className="font-num text-ink">{a.lamA.toFixed(2)}</span>
                    {" · "}预期总进球 <span className="font-num text-amber">{(a.lamH + a.lamA).toFixed(2)}</span>
                    {" · "}标定源：{a.calibSource}
                  </p>
                </div>
                <button
                  onClick={() => setActiveMatch(null)}
                  className="text-faint hover:text-mut text-xs px-2"
                >
                  收起
                </button>
              </div>

              <TierSection
                label="价值档"
                desc="EV≥10%，正期望 · 主推"
                picks={a.value}
                cls="bg-amber/10 text-amber"
              />
              <TierSection
                label="稳健档"
                desc="命中率高，常含贴水，不等于稳赚"
                picks={a.stable}
                cls="bg-neon/10 text-neon"
              />
              <TierSection
                label="博胆档"
                desc="冷门高赔，正期望，高方差"
                picks={a.longshot}
                cls="bg-live/10 text-live"
              />

              {a.stable.length === 0 && a.value.length === 0 && a.longshot.length === 0 && (
                <p className="text-sm text-faint">本场无符合条件的偏差点（EV 均为负或不显著）</p>
              )}
            </section>
          );
        })}

      {/* ── 串关组合 ─────────────────────── */}
      {(parlays2.value.length > 0 || parlays3.value.length > 0) && (
        <section>
          <h2 className="text-base font-semibold text-ink mb-1">价值串关（全腿+EV）</h2>
          <p className="text-xs text-mut mb-3">
            每条腿都是正期望时，串关优势指数级放大。混入负 EV 腿贴水会被复利吃掉。
          </p>

          {parlays2.value.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm text-mut mb-2">2 串 1</h3>
              <div className="space-y-2">
                {parlays2.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
              </div>
            </div>
          )}

          {parlays3.value.length > 0 && (
            <div>
              <h3 className="text-sm text-mut mb-2">3 串 1</h3>
              <div className="space-y-2">
                {parlays3.value.map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 资金分配 ──────────────────────── */}
      {allValueParlays.length > 0 && (
        <section>
          <BankrollPlanner parlays={allValueParlays} />
        </section>
      )}

      {/* ── 稳健串（参考） ────────────────── */}
      {parlays2.stable.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink mb-1">稳健串（命中率最高）</h2>
          <p className="text-xs text-mut mb-3">高胜率优先，注意高命中率常含贴水，不等于正期望。</p>
          <div className="space-y-2">
            {parlays2.stable.slice(0, 3).map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
          </div>
        </section>
      )}

      {/* ── 免责声明 ──────────────────────── */}
      <div className="rounded-xl border border-line/60 p-4 bg-raised/40 text-xs text-faint leading-relaxed">
        <p className="font-medium text-mut mb-1">分析声明</p>
        <p>{DISCLAIMER}</p>
        <p className="mt-1">
          EV 引擎仅做概率偏差测算，结果完全取决于赔率质量与模型假设。
          当前无参考锐盘，仅凭体彩单一赔率标定，数学上无法"稳赚不赔"（赔率内置贴水）。
          本页所有输出<strong>不构成任何投注建议</strong>，下注请量力而行。
        </p>
      </div>
    </div>
  );
}
