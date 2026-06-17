"use client";

import { useMemo, useState } from "react";
import type { EvPick, EvParlay, MatchAnalysis } from "@/lib/ev-engine";
import { analyzeMatches, EV_VALUE, MAX_SINGLE, KELLY_FRACTION } from "@/lib/ev-engine";
import type { EvMatch } from "@/lib/ev-engine";
import { DISCLAIMER } from "@/lib/odds";

// ── 工具 ───────────────────────────────────────────────────

function pct(x: number, d = 1) { return `${(x * 100).toFixed(d)}%`; }

function evColor(ev: number) {
  if (ev >= 0.15) return "text-neon font-semibold";
  if (ev >= 0.05) return "text-neon/70";
  if (ev <= -0.1) return "text-live";
  return "text-mut";
}

function hitLevel(p: number): { label: string; cls: string; note: string } {
  if (p >= 0.30) return { label: "命中率较高", cls: "bg-neon/10 text-neon", note: "相对容易兑现" };
  if (p >= 0.08) return { label: "中等命中", cls: "bg-amber/10 text-amber", note: "兑现有难度" };
  return { label: "极低命中 · 波动极大", cls: "bg-live/10 text-live", note: "多数情况会落空，类似彩票" };
}

const MARKET_ORDER = ["胜平负", "让球胜平负", "大小球", "总进球", "比分", "双方进球", "半全场"];

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
  let raw = parlays.filter(p => p.ev > EV_VALUE).slice(0, 6)
    .map(p => ({ parlay: p, stake: Math.max(1, safeStake(p.pModel, p.odds, bankroll)) }));
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
        <span className={`block h-full rounded-full anim-grow-bar ${color}`} style={{ width: `${w}%` }} />
      </span>
    </div>
  );
}

// ── 胜平负 / 大小球 可视化 ──────────────────────────────────

function StackBar({ segments }: { segments: { label: string; value: number; cls: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex items-center gap-3 text-xs text-mut mb-1 flex-wrap">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-sm ${s.cls}`} />
            {s.label} <span className="font-num tabular-nums text-ink">{pct(s.value / total, 0)}</span>
          </span>
        ))}
      </div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-line">
        {segments.map((s, i) => (
          <span key={i} className={`h-full anim-grow-bar ${s.cls}`} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function ProbBars({ mp, scores }: { mp: Record<string, Record<string, number>>; scores: number[][] }) {
  const whl = mp["胜平负"];
  // 大小球(2.5)从比分矩阵聚合，体彩未单开此盘也能展示模型倾向
  let over = 0, under = 0, tot = 0;
  for (let h = 0; h < scores.length; h++)
    for (let a = 0; a < scores.length; a++) {
      const p = scores[h][a]; tot += p;
      if (h + a > 2.5) over += p; else under += p;
    }
  const ou = tot > 0 ? { 大: over / tot, 小: under / tot } : null;
  if (!whl && !ou) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {whl && (
        <div>
          <p className="text-xs font-medium text-ink mb-1.5">胜平负</p>
          <StackBar segments={[
            { label: "主胜", value: whl["胜"] ?? 0, cls: "bg-neon" },
            { label: "平", value: whl["平"] ?? 0, cls: "bg-faint" },
            { label: "客胜", value: whl["负"] ?? 0, cls: "bg-amber" },
          ]} />
        </div>
      )}
      {ou && (
        <div>
          <p className="text-xs font-medium text-ink mb-1.5">大小球（2.5 球）</p>
          <StackBar segments={[
            { label: "大球", value: ou["大"], cls: "bg-neon" },
            { label: "小球", value: ou["小"], cls: "bg-amber" },
          ]} />
        </div>
      )}
    </div>
  );
}

// ── 比分概率热力图 ─────────────────────────────────────────

function ScoreHeatmap({ scores, home, away }: { scores: number[][]; home: string; away: string }) {
  const size = scores.length;
  let maxP = 0, topH = 0, topA = 0;
  for (let h = 0; h < size; h++)
    for (let a = 0; a < size; a++)
      if (scores[h][a] > maxP) { maxP = scores[h][a]; topH = h; topA = a; }
  if (maxP <= 0) return null;

  return (
    <details className="rounded-xl border border-line bg-surface p-4 group" open>
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="text-sm font-medium text-ink">比分概率热力图</span>
        <span className="text-xs text-faint">
          最可能 <span className="font-num tabular-nums text-neon">{topH}:{topA}</span>（{pct(maxP)}）
        </span>
      </summary>

      <div className="mt-3 overflow-x-auto">
        <div className="inline-block">
          {/* 列头：客队进球 */}
          <div className="flex">
            <div className="w-8 shrink-0" />
            <div className="text-[10px] text-faint text-center" style={{ width: `${size * 38}px` }}>
              {away} 进球 →
            </div>
          </div>
          <div className="flex">
            <div className="w-8 shrink-0" />
            {Array.from({ length: size }, (_, a) => (
              <div key={a} className="w-[38px] text-center text-[11px] font-num tabular-nums text-faint pb-1">{a}</div>
            ))}
          </div>
          {/* 行 */}
          {scores.map((row, h) => (
            <div key={h} className="flex items-center">
              <div className="w-8 shrink-0 text-center text-[11px] font-num tabular-nums text-faint">{h}</div>
              {row.map((p, a) => {
                const alpha = Math.min(0.9, (p / maxP) * 0.9);
                const isTop = h === topH && a === topA;
                const dark = alpha > 0.45;
                return (
                  <div
                    key={a}
                    className={`w-[38px] h-[38px] flex items-center justify-center text-[10px] font-num tabular-nums border border-surface ${isTop ? "ring-2 ring-neon ring-inset rounded" : ""}`}
                    // 数据色：neon rgb(12,157,104) 按概率渐变，属可视化用途
                    style={{ backgroundColor: `rgba(12, 157, 104, ${alpha})`, color: dark ? "#fff" : "var(--color-mut)" }}
                    title={`${home} ${h} : ${a} ${away} — ${pct(p)}`}
                  >
                    {p >= 0.03 ? (p * 100).toFixed(0) : ""}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="w-8 shrink-0 inline-block" />
          <span className="text-[10px] text-faint ml-9">↑ {home} 进球 · 数字为该比分概率%</span>
        </div>
      </div>
    </details>
  );
}

// ── 单注表（接收已排序/筛选的 picks） ───────────────────────

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
    <div className="p-4 rounded-xl border border-line bg-surface anim-fade-up">
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
  const [bankroll, setBankroll] = useState(200);
  const plan = computePlan(parlays, bankroll);
  if (plan.entries.length === 0) return null;
  return (
    <div className="card overflow-hidden anim-fade-up">
      {/* 标题栏 */}
      <div className="px-5 py-3 bg-neon/5 border-b border-neon/10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink">⑤ 方案单（投入参考）</h3>
          <p className="text-xs text-mut mt-0.5">凯利公式风控：单注 ≤本金{(MAX_SINGLE * 100).toFixed(0)}%，总投入 ≤20%</p>
        </div>
        <span className="chip text-xs bg-neon/10 text-neon">仅供参考</span>
      </div>

      <div className="p-5 space-y-4">
        {/* 本金输入 */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-mut shrink-0">本金（元）</label>
          <input
            type="number" min={10} max={100000} step={10} value={bankroll}
            onChange={e => setBankroll(Math.max(10, Number(e.target.value)))}
            className="border border-line rounded-lg px-3 py-1.5 text-sm font-num tabular-nums w-28 bg-surface focus:outline-none focus:border-neon"
          />
          <input
            type="range" min={10} max={5000} step={10} value={Math.min(bankroll, 5000)}
            onChange={e => setBankroll(Number(e.target.value))}
            className="flex-1 accent-neon"
          />
        </div>

        {/* 方案列表——购彩单样式 */}
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="bg-raised/60 px-4 py-2 text-xs text-faint border-b border-line flex justify-between">
            <span>方案内容</span>
            <span>赔率 / 建议投入</span>
          </div>
          {plan.entries.map(({ parlay, stake }, i) => {
            const legs = parlay.legs.map(l => `${l.game.split(" vs ")[0]} · ${l.outcome}`);
            const stakeRounded = Math.max(1, Math.round(stake));
            return (
              <div key={i} className="px-4 py-3 border-b border-line last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-faint">注{i + 1} · {parlay.legs.length}串1</span>
                    <div className="mt-1 space-y-0.5">
                      {legs.map((leg, j) => (
                        <p key={j} className="text-xs text-ink/80">└ {leg}</p>
                      ))}
                    </div>
                    <p className="text-xs text-mut mt-1">
                      命中率 <span className="font-num tabular-nums text-ink">{pct(parlay.pModel)}</span>
                      <span className="mx-1.5 text-faint">·</span>
                      EV <span className={`font-num tabular-nums ${evColor(parlay.ev)}`}>{parlay.ev >= 0 ? "+" : ""}{pct(parlay.ev)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-num tabular-nums text-amber font-semibold">{parlay.odds.toFixed(2)}倍</p>
                    <p className="font-num tabular-nums text-neon font-bold text-lg">{stakeRounded}<span className="text-xs font-normal ml-0.5">元</span></p>
                  </div>
                </div>
              </div>
            );
          })}
          {/* 合计 */}
          <div className="px-4 py-3 bg-raised/40 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-ink">合计投入</p>
              <p className="text-xs text-faint mt-0.5">占本金 {pct(plan.totalStake / bankroll)}</p>
            </div>
            <div className="text-right">
              <p className="font-num tabular-nums font-bold text-ink text-xl">{Math.round(plan.totalStake)}<span className="text-sm font-normal ml-1">元</span></p>
              <p className={`text-xs font-num tabular-nums mt-0.5 ${plan.expProfit >= 0 ? "text-neon" : "text-live"}`}>
                期望 {plan.expProfit >= 0 ? "+" : ""}{plan.expProfit.toFixed(0)} 元
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-faint">
          「期望收益」是数学平均值，不是承诺。单次结果可能全额亏损。赔率来源：中国体彩官方竞彩平台。
        </p>
      </div>
    </div>
  );
}

// ── 看懂图例 ───────────────────────────────────────────────

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
        <p><span className="font-medium text-ink">热力图：</span>颜色越深=该比分越可能。绿框是模型估的最可能比分。</p>
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

// ── 单场分析卡 ─────────────────────────────────────────────

function MatchCard({ a, sortBy, mf, delay }: {
  a: MatchAnalysis; sortBy: "value" | "hit"; mf: Set<string>; delay: number;
}) {
  const view = (picks: EvPick[]) => {
    let r = mf.size ? picks.filter(p => mf.has(p.market)) : picks;
    return [...r].sort((x, y) => sortBy === "hit" ? y.pModel - x.pModel : y.ev - x.ev);
  };
  const v = view(a.value), s = view(a.stable), l = view(a.longshot);
  const empty = v.length === 0 && s.length === 0 && l.length === 0;

  return (
    <div className="card p-5 space-y-5 anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div>
        <h3 className="font-semibold text-ink">{a.match.home} vs {a.match.away}</h3>
        <p className="text-xs text-mut mt-0.5">
          模型预期进球 <span className="font-num tabular-nums text-ink">{a.match.home} {a.lamH.toFixed(1)}</span>
          <span className="text-faint"> - </span>
          <span className="font-num tabular-nums text-ink">{a.lamA.toFixed(1)} {a.match.away}</span>
        </p>
      </div>

      <ProbBars mp={a.mp} scores={a.scores} />
      <ScoreHeatmap scores={a.scores} home={a.match.home} away={a.match.away} />

      {empty
        ? <p className="text-sm text-faint">{mf.size ? "所选玩法下本场无符合条件的点。" : "本场没找到明显划算的点（各玩法赔率都接近或低于估算的真实水平）。"}</p>
        : <>
            <PickTable label="价值档" desc="赔率偏高，长期划算的点" picks={v} cls="bg-amber/10 text-amber" />
            <PickTable label="稳健档" desc="命中率高，但常含贴水，不等于划算" picks={s} cls="bg-neon/10 text-neon" />
            <PickTable label="博胆档" desc="高赔冷门，押中难、波动大" picks={l} cls="bg-live/10 text-live" />
          </>
      }
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────

// ── 系统过关卡 ─────────────────────────────────────────────

function SystemBetCard({ bets, label }: { bets: EvParlay[]; label: string }) {
  if (bets.length === 0) return null;
  const totalOdds = bets.reduce((s, b) => s + b.odds, 0);
  const totalP = bets.reduce((s, b) => s + b.pModel, 0) / bets.length;
  return (
    <div className="card p-5 anim-fade-up">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-semibold text-ink">{label}</span>
        <span className="chip text-xs bg-raised">{bets.length} 注</span>
        <span className="text-xs text-faint">每注单独结算，不用全中也能回本</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-xs">
          <thead>
            <tr className="text-faint border-b border-line">
              <th className="py-1.5 px-2 text-left">注次</th>
              <th className="py-1.5 px-2 text-left">内容</th>
              <th className="py-1.5 px-2 text-right">赔率</th>
              <th className="py-1.5 px-2 text-right">命中率</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-2 px-2 text-faint whitespace-nowrap">注{i + 1}</td>
                <td className="py-2 px-2 text-ink/80">
                  {b.legs.map((l, j) => (
                    <span key={j} className="inline-flex items-center gap-1 mr-2">
                      <span>{l.game.split(" vs ")[0]}</span>
                      <span className="font-medium text-ink">{l.outcome}</span>
                    </span>
                  ))}
                </td>
                <td className="py-2 px-2 font-num tabular-nums text-amber text-right">{b.odds.toFixed(2)}</td>
                <td className="py-2 px-2 font-num tabular-nums text-right">{pct(b.pModel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-line text-xs text-mut">
        <span>平均赔率 <span className="font-num tabular-nums text-amber">{(totalOdds / bets.length).toFixed(2)}</span></span>
        <span>平均命中率 <span className="font-num tabular-nums text-ink">{pct(totalP)}</span></span>
        <span className="text-faint">仅供参考，不构成购彩建议</span>
      </div>
    </div>
  );
}

export default function ResultView({ matches }: { matches: EvMatch[] }) {
  const result = useMemo(() => analyzeMatches(matches), [matches]);
  const valueParlays = [
    ...result.parlays2.value,
    ...result.parlays3.value,
    ...result.parlays4.value,
  ].slice(0, 6);

  const [sortBy, setSortBy] = useState<"value" | "hit">("value");
  const [mf, setMf] = useState<Set<string>>(new Set());

  // 出现过的玩法（按固定顺序）
  const allMarkets = useMemo(() => {
    const set = new Set<string>();
    for (const a of result.analyses)
      for (const p of a.picks) set.add(p.market);
    return MARKET_ORDER.filter(m => set.has(m));
  }, [result]);

  const toggleMarket = (m: string) =>
    setMf(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });

  return (
    <div className="space-y-6">

      <Legend />

      {/* 速览表 */}
      <section className="card p-5 anim-fade-up">
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

      {/* 每场详细分析 + 控制栏 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-ink">② 每场详细分析</h2>
          <div className="inline-flex rounded-full border border-line overflow-hidden text-xs">
            <button
              onClick={() => setSortBy("value")}
              className={`px-3 py-1.5 transition ${sortBy === "value" ? "bg-neon text-white" : "text-mut hover:bg-raised/40"}`}
            >按价值</button>
            <button
              onClick={() => setSortBy("hit")}
              className={`px-3 py-1.5 transition ${sortBy === "hit" ? "bg-neon text-white" : "text-mut hover:bg-raised/40"}`}
            >按命中率</button>
          </div>
        </div>

        {/* 玩法筛选 */}
        {allMarkets.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-faint mr-1">玩法：</span>
            <button
              onClick={() => setMf(new Set())}
              className={`chip text-xs transition ${mf.size === 0 ? "bg-neon/10 text-neon" : "hover:bg-raised"}`}
            >全部</button>
            {allMarkets.map(m => (
              <button
                key={m}
                onClick={() => toggleMarket(m)}
                className={`chip text-xs transition ${mf.has(m) ? "bg-neon/10 text-neon" : "hover:bg-raised"}`}
              >{m}</button>
            ))}
          </div>
        )}

        {result.analyses.map((a, i) => (
          <MatchCard key={a.match.matchId} a={a} sortBy={sortBy} mf={mf} delay={i * 60} />
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

      {/* 4串1 */}
      {result.parlays4.value.length > 0 && (
        <section>
          <h2 className="font-semibold text-ink mb-1">④ 4串1（每腿都划算）</h2>
          <p className="text-xs text-mut mb-3">四场全串，全中赔率相乘，命中率更低但倍数最高。</p>
          <div className="space-y-2">
            {result.parlays4.value.slice(0, 3).map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
          </div>
        </section>
      )}

      {/* 高命中串 */}
      {result.parlays2.stable.length > 0 && (
        <section>
          <h2 className="font-semibold text-ink mb-1">⑤ 高命中串</h2>
          <p className="text-xs text-mut mb-3">优先命中率，相对容易兑现；但常含贴水，长期价值未必为正。</p>
          <div className="space-y-2">
            {result.parlays2.stable.slice(0, 3).map((p, i) => <ParlayCard key={i} parlay={p} rank={i + 1} />)}
          </div>
        </section>
      )}

      {/* 系统过关（多串多） */}
      {result.systemBets.length > 0 && (
        <section>
          <h2 className="font-semibold text-ink mb-1">⑥ 系统过关（多串多）</h2>
          <p className="text-xs text-mut mb-3">自动取多场各自最佳一腿，生成所有组合。<strong className="text-ink">每注独立结算</strong>，不需要全部中。</p>
          <div className="space-y-3">
            {result.systemBets.map((bets, i) => {
              const nLegs = bets[0]?.legs.length ?? 0;
              const nMatches = Math.max(...bets.map(b => b.legs.length));
              const label = `${matches.length}场 · ${nLegs}腿组合（${bets.length}注）`;
              return <SystemBetCard key={i} bets={bets} label={label} />;
            })}
          </div>
        </section>
      )}

      {/* 资金计划 / 方案单 */}
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
