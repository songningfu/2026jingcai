"use client";

import { useMemo, useState } from "react";
import {
  DISCLAIMER,
  combinations,
  impliedProbabilities,
  mOfNTotalOdds,
  parlayOdds,
  parlayProbability,
} from "@/lib/odds";
import type { SportteryOddsPayload } from "@/lib/sporttery-types";
import SportteryOddsBoard from "../odds/SportteryOddsBoard";

/* ---------- 工具函数 ---------- */

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const money = (v: number) =>
  v >= 10000 ? `${(v / 10000).toFixed(2)} 万元` : `${v.toFixed(2)} 元`;

function parseOdd(s: string): number | null {
  const v = Number(s);
  return Number.isFinite(v) && v > 1 ? v : null;
}

/* ---------- 单场概率换算 ---------- */

interface OutcomeRow {
  label: string;
  odd: string;
}

function SingleMatchTool() {
  const [rows, setRows] = useState<OutcomeRow[]>([
    { label: "主胜", odd: "" },
    { label: "平局", odd: "" },
    { label: "客胜", odd: "" },
  ]);

  const odds = rows.map((r) => parseOdd(r.odd));
  const allValid = odds.every((o) => o !== null) && odds.length >= 2;
  const result = allValid ? impliedProbabilities(odds as number[]) : null;

  const update = (i: number, field: keyof OutcomeRow, value: string) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  return (
    <section className="space-y-4">
      <p className="text-sm text-mut">
        输入某一玩法下所有结果的十进制赔率（如胜平负三项），换算为隐含概率。
        归一化概率已去除「水位」，由赔率反推、含市场情绪，
        <strong>非真实胜率</strong>。
      </p>

      <div className="overflow-hidden card">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-mut">
            <tr>
              <th className="px-4 py-2 font-medium">结果</th>
              <th className="px-4 py-2 font-medium">赔率</th>
              <th className="px-4 py-2 font-medium">原始隐含概率</th>
              <th className="px-4 py-2 font-medium">归一化概率</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-2">
                  <input
                    value={row.label}
                    onChange={(e) => update(i, "label", e.target.value)}
                    className="w-24 rounded-md border border-line bg-raised px-2 py-1 text-ink focus:border-neon focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={row.odd}
                    onChange={(e) => update(i, "odd", e.target.value)}
                    placeholder="如 2.05"
                    inputMode="decimal"
                    className="w-24 rounded-md border border-line bg-raised px-2 py-1 text-ink focus:border-neon focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2 tabular-nums text-mut">
                  {result ? pct(result.raw[i]) : "—"}
                </td>
                <td className="px-4 py-2 tabular-nums font-medium text-neon">
                  {result ? pct(result.probs[i]) : "—"}
                </td>
                <td className="px-2 py-2">
                  {rows.length > 2 && (
                    <button
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                      className="text-faint hover:text-red-500"
                      aria-label="删除该结果"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setRows([...rows, { label: `结果${rows.length + 1}`, odd: "" }])}
          className="rounded-md border border-neon/30 px-3 py-1.5 text-sm text-neon hover:bg-neon/10"
        >
          + 添加结果（比分 / 总进球等多结果玩法）
        </button>
        {result && (
          <p className="text-sm text-mut">
            该玩法理论返还率：
            <span className="font-semibold text-neon">{pct(result.returnRate)}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- 串关 / 复式计算 ---------- */

type Outcome = "win" | "draw" | "loss";
const OUTCOME_LABELS: Record<Outcome, string> = {
  win: "主胜",
  draw: "平局",
  loss: "客胜",
};

interface MatchRow {
  id: number;
  name: string;
  odds: Record<Outcome, string>;
  pick: Outcome | null;
}

let nextId = 3;
const emptyMatch = (id: number): MatchRow => ({
  id,
  name: "",
  odds: { win: "", draw: "", loss: "" },
  pick: null,
});

function ParlayTool() {
  const [matches, setMatches] = useState<MatchRow[]>([emptyMatch(1), emptyMatch(2)]);
  const [selectedWays, setSelectedWays] = useState<Set<number>>(new Set());
  const [stakeStr, setStakeStr] = useState("2");

  const updateMatch = (id: number, patch: Partial<MatchRow>) =>
    setMatches(matches.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /** 每场的解析结果：所选结果的赔率与归一化概率 */
  const picks = useMemo(
    () =>
      matches.map((m) => {
        const oddsArr = [m.odds.win, m.odds.draw, m.odds.loss].map(parseOdd);
        if (oddsArr.some((o) => o === null) || !m.pick) return null;
        const implied = impliedProbabilities(oddsArr as number[])!;
        const idx = (["win", "draw", "loss"] as Outcome[]).indexOf(m.pick);
        return { odd: (oddsArr as number[])[idx], prob: implied.probs[idx] };
      }),
    [matches],
  );

  const validPicks = picks.filter((p) => p !== null);
  const n = validPicks.length;
  const stake = Math.max(0, Number(stakeStr) || 0);

  const pickedOdds = validPicks.map((p) => p.odd);
  const pickedProbs = validPicks.map((p) => p.prob);

  /** 可选过关方式：2串1 至 n串1（n≥1 时含单关） */
  const availableWays = Array.from({ length: n }, (_, i) => i + 1).filter(
    (m) => n >= 2 || m === 1,
  );
  const activeWays = availableWays.filter((m) => selectedWays.has(m));

  const wayRows = activeWays.map((m) => {
    const count = combinations(n, m);
    return {
      m,
      count,
      cost: count * stake,
      maxReturn: stake * mOfNTotalOdds(pickedOdds, m),
    };
  });
  const totalCount = wayRows.reduce((a, r) => a + r.count, 0);
  const totalCost = wayRows.reduce((a, r) => a + r.cost, 0);
  const totalMaxReturn = wayRows.reduce((a, r) => a + r.maxReturn, 0);

  const toggleWay = (m: number) => {
    const next = new Set(selectedWays);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setSelectedWays(next);
  };

  return (
    <section className="space-y-5">
      <p className="text-sm text-mut">
        每场填入胜平负三项赔率并选定一个结果，再勾选过关方式，
        实时计算注数、总投入与理论全中概率。
      </p>

      <div className="space-y-3">
        {matches.map((match, mi) => {
          const oddsArr = [match.odds.win, match.odds.draw, match.odds.loss].map(parseOdd);
          const implied = oddsArr.every((o) => o !== null)
            ? impliedProbabilities(oddsArr as number[])
            : null;
          return (
            <div key={match.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <input
                  value={match.name}
                  onChange={(e) => updateMatch(match.id, { name: e.target.value })}
                  placeholder={`第 ${mi + 1} 场（可填对阵，如 阿根廷 vs 法国）`}
                  className="w-64 rounded-md border border-line bg-raised px-2 py-1 text-sm text-ink focus:border-neon focus:outline-none"
                />
                {matches.length > 1 && (
                  <button
                    onClick={() => setMatches(matches.filter((m) => m.id !== match.id))}
                    className="text-sm text-faint hover:text-red-500"
                  >
                    移除
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["win", "draw", "loss"] as Outcome[]).map((o, oi) => {
                  const picked = match.pick === o;
                  return (
                    <label
                      key={o}
                      className={`cursor-pointer rounded-lg border p-3 text-center transition ${
                        picked
                          ? "border-neon bg-neon/10 ring-1 ring-neon"
                          : "border-line hover:border-neon/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`pick-${match.id}`}
                        checked={picked}
                        onChange={() => updateMatch(match.id, { pick: o })}
                        className="sr-only"
                      />
                      <div className="text-xs text-mut">{OUTCOME_LABELS[o]}</div>
                      <input
                        value={match.odds[o]}
                        onChange={(e) =>
                          updateMatch(match.id, {
                            odds: { ...match.odds, [o]: e.target.value },
                          })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="赔率"
                        inputMode="decimal"
                        className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1 text-center text-sm text-ink focus:border-neon focus:outline-none"
                      />
                      <div className="mt-1 text-xs tabular-nums text-neon">
                        {implied ? pct(implied.probs[oi]) : "—"}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setMatches([...matches, emptyMatch(nextId++)])}
        className="rounded-md border border-neon/30 px-3 py-1.5 text-sm text-neon hover:bg-neon/10"
      >
        + 添加一场
      </button>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-sm font-medium text-ink">
            过关方式（已完整填写 {n} 场）：
          </span>
          {availableWays.length === 0 && (
            <span className="text-sm text-faint">先在上方完整填写赔率并选定结果</span>
          )}
          {availableWays.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selectedWays.has(m)}
                onChange={() => toggleWay(m)}
                className="accent-[#41e296]"
              />
              {m === 1 ? "单关" : `${m} 串 1`}
              <span className="text-xs text-faint">({combinations(n, m)} 注)</span>
            </label>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            单注金额
            <input
              value={stakeStr}
              onChange={(e) => setStakeStr(e.target.value)}
              inputMode="decimal"
              className="w-16 rounded-md border border-line bg-raised px-2 py-1 text-center text-ink focus:border-neon focus:outline-none"
            />
            元
          </label>
        </div>

        {wayRows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-mut">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">方式</th>
                <th className="py-2 font-medium">注数</th>
                <th className="py-2 font-medium">投入</th>
                <th className="py-2 font-medium">全中时返奖</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {wayRows.map((r) => (
                <tr key={r.m} className="border-b border-line">
                  <td className="py-2">{r.m === 1 ? "单关" : `${r.m} 串 1`}</td>
                  <td className="py-2">{r.count}</td>
                  <td className="py-2">{money(r.cost)}</td>
                  <td className="py-2">{money(r.maxReturn)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2">合计</td>
                <td className="py-2">{totalCount}</td>
                <td className="py-2">{money(totalCost)}</td>
                <td className="py-2">{money(totalMaxReturn)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {n >= 2 && (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 rounded-lg bg-raised px-4 py-3 text-sm">
            <span>
              {n} 场串关总赔率：
              <strong className="tabular-nums text-neon">
                {parlayOdds(pickedOdds).toFixed(2)}
              </strong>
            </span>
            <span>
              理论全中概率：
              <strong className="tabular-nums text-neon">
                {pct(parlayProbability(pickedProbs))}
              </strong>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- 页面主体 ---------- */

const TABS = [
  { key: "official", label: "官方赔率" },
  { key: "single", label: "手动单场" },
  { key: "parlay", label: "手动串关" },
] as const;

export default function Calculator({
  sportteryPayload,
}: {
  sportteryPayload: SportteryOddsPayload;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("official");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">概率工具</h1>
      <p className="mt-1 text-sm text-mut">
        官方赔率、手动换算和金额模拟放在一个体系里 — 只做数学，不做建议。
      </p>

      <div className="mt-6 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
              tab === t.key
                ? "bg-neon font-medium text-pitch"
                : "bg-surface text-mut ring-1 ring-line hover:ring-neon/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "official" ? (
          <SportteryOddsBoard payload={sportteryPayload} embedded />
        ) : tab === "single" ? (
          <SingleMatchTool />
        ) : (
          <ParlayTool />
        )}
      </div>

      {/* 第 0 章第 3 条：输出旁固定展示，不得移除 */}
      {tab !== "official" && (
        <p className="mt-8 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
          {DISCLAIMER}
        </p>
      )}
    </div>
  );
}
