"use client";

import { useState } from "react";
import { DISCLAIMER, impliedProbabilities } from "@/lib/odds";
import type { SportteryOddsPayload } from "@/lib/sporttery-types";
import SportteryOddsBoard from "../odds/SportteryOddsBoard";

/* ---------- 工具函数 ---------- */

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
function parseOdd(s: string): number | null {
  const v = Number(s);
  return Number.isFinite(v) && v > 1 ? v : null;
}

/* ---------- 单场概率换算 ---------- */

interface OutcomeRow {
  label: string;
  odd: string;
}

const PLAY_PRESETS: { name: string; rows: OutcomeRow[] }[] = [
  {
    name: "胜平负",
    rows: [{ label: "主胜", odd: "" }, { label: "平局", odd: "" }, { label: "客胜", odd: "" }],
  },
  {
    name: "总进球",
    rows: [
      { label: "0球", odd: "" }, { label: "1球", odd: "" }, { label: "2球", odd: "" },
      { label: "3球", odd: "" }, { label: "4球", odd: "" }, { label: "5球", odd: "" },
      { label: "6球", odd: "" }, { label: "7+球", odd: "" },
    ],
  },
  {
    name: "半全场",
    rows: [
      { label: "主/主", odd: "" }, { label: "主/平", odd: "" }, { label: "主/客", odd: "" },
      { label: "平/主", odd: "" }, { label: "平/平", odd: "" }, { label: "平/客", odd: "" },
      { label: "客/主", odd: "" }, { label: "客/平", odd: "" }, { label: "客/客", odd: "" },
    ],
  },
  {
    name: "比分",
    rows: [
      { label: "1-0", odd: "" }, { label: "2-0", odd: "" }, { label: "2-1", odd: "" },
      { label: "3-0", odd: "" }, { label: "3-1", odd: "" }, { label: "3-2", odd: "" },
      { label: "0-0", odd: "" }, { label: "1-1", odd: "" }, { label: "2-2", odd: "" },
      { label: "0-1", odd: "" }, { label: "0-2", odd: "" }, { label: "1-2", odd: "" },
      { label: "0-3", odd: "" }, { label: "1-3", odd: "" }, { label: "2-3", odd: "" },
      { label: "其他", odd: "" },
    ],
  },
];

function SingleMatchTool() {
  const [preset, setPreset] = useState(0);
  const [rows, setRows] = useState<OutcomeRow[]>(PLAY_PRESETS[0].rows);

  const odds = rows.map((r) => parseOdd(r.odd));
  const allValid = odds.every((o) => o !== null) && odds.length >= 2;
  const result = allValid ? impliedProbabilities(odds as number[]) : null;

  const update = (i: number, field: keyof OutcomeRow, value: string) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-faint">玩法：</span>
        {PLAY_PRESETS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => { setPreset(i); setRows(p.rows.map((r) => ({ ...r }))); }}
            className={`rounded-full px-3 py-1 text-xs transition ${
              preset === i ? "bg-neon/15 font-medium text-neon ring-1 ring-neon/30" : "bg-raised text-mut hover:text-ink"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="text-sm text-mut">
        输入所选玩法所有结果的十进制赔率，换算为隐含概率。
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

/* ---------- 价值指标（EV / 凯利，规格 5.4 纯数学指标） ---------- */

interface ValueRow {
  label: string;
  odd: string;
  prob: string; // 用户对该结果的概率估计（百分数）
}

function ValueIndicatorTool() {
  const [rows, setRows] = useState<ValueRow[]>([
    { label: "主胜", odd: "", prob: "" },
    { label: "平局", odd: "", prob: "" },
    { label: "客胜", odd: "", prob: "" },
  ]);

  const update = (i: number, field: keyof ValueRow, value: string) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const probSum = rows.reduce((a, r) => a + (Number(r.prob) || 0), 0);

  return (
    <section className="space-y-4">
      <p className="text-sm leading-relaxed text-mut">
        输入官方赔率与<strong>你自己对各结果的概率估计</strong>，得到两个纯数学指标：
        <br />
        <span className="text-ink">期望值 EV</span> = 你的概率 × 赔率 − 1（&gt;0 表示按你的估计该笔数学期望为正，&lt;0 为负）；
        <span className="text-ink">凯利比例</span> = EV ÷（赔率 − 1）（数学上的理论仓位占比）。
        二者只是<strong>描述这笔的数学性价比</strong>，不代表真实结果，更不构成任何购彩建议。
      </p>

      <div className="overflow-hidden card">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-mut">
            <tr>
              <th className="px-3 py-2 font-medium">结果</th>
              <th className="px-3 py-2 font-medium">赔率</th>
              <th className="px-3 py-2 font-medium">你的概率%</th>
              <th className="px-3 py-2 font-medium">期望值 EV</th>
              <th className="px-3 py-2 font-medium">凯利比例</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const o = parseOdd(row.odd);
              const p = Number(row.prob);
              const valid = o !== null && Number.isFinite(p) && p > 0 && p <= 100;
              const ev = valid ? (p / 100) * o! - 1 : null;
              const kelly = valid && o! > 1 ? ev! / (o! - 1) : null;
              return (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2 text-ink">{row.label}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.odd}
                      onChange={(e) => update(i, "odd", e.target.value)}
                      placeholder="2.05"
                      inputMode="decimal"
                      className="w-16 rounded-md border border-line bg-raised px-2 py-1 text-center text-ink focus:border-neon focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.prob}
                      onChange={(e) => update(i, "prob", e.target.value)}
                      placeholder="50"
                      inputMode="decimal"
                      className="w-16 rounded-md border border-line bg-raised px-2 py-1 text-center text-ink focus:border-neon focus:outline-none"
                    />
                  </td>
                  <td
                    className={`px-3 py-2 font-num tabular-nums ${
                      ev === null ? "text-faint" : ev > 0 ? "text-neon" : "text-mut"
                    }`}
                  >
                    {ev === null ? "—" : `${ev > 0 ? "+" : ""}${(ev * 100).toFixed(1)}%`}
                  </td>
                  <td
                    className={`px-3 py-2 font-num tabular-nums ${
                      kelly === null ? "text-faint" : kelly > 0 ? "text-neon" : "text-mut"
                    }`}
                  >
                    {kelly === null ? "—" : `${(kelly * 100).toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {probSum > 0 && Math.abs(probSum - 100) > 1 && (
        <p className="text-xs text-amber/80">
          提示：你填的概率之和为 {probSum.toFixed(0)}%，通常一场比赛各结果概率合计应接近 100%。
        </p>
      )}

      <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        EV 与凯利均为基于<strong>你输入的概率估计</strong>的数学换算，估计错则指标无意义；
        市场赔率长期含返还率损耗（约 −10%~−15%）。本工具仅作数学性质说明，
        <strong>不构成任何购彩建议</strong>，理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </section>
  );
}

/* ---------- 页面主体：官方赔率为主，手动换算折叠为辅助 ---------- */

export default function Calculator({
  sportteryPayload,
}: {
  sportteryPayload: SportteryOddsPayload;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">赔率工具</h1>
      <p className="mt-1 text-sm text-mut">
        竞彩官方在售赔率自动载入，点选即可组合串关、实时换算 — 只做数学，不做建议。
      </p>

      <div className="mt-6">
        <SportteryOddsBoard payload={sportteryPayload} embedded />
      </div>

      {/* 官方未开售的场次/玩法，用手动换算兜底 */}
      <details className="card mt-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm text-mut transition hover:text-ink [&::-webkit-details-marker]:hidden">
          <span>
            手动换算
            <span className="ml-2 text-xs text-faint">
              官方未开售的场次或其他玩法，手动输入赔率换算概率
            </span>
          </span>
          <span className="text-faint">›</span>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <SingleMatchTool />
        </div>
      </details>

      {/* 价值指标：EV / 凯利（规格 5.4 高级工具） */}
      <details className="card mt-4 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm text-mut transition hover:text-ink [&::-webkit-details-marker]:hidden">
          <span>
            价值指标（EV / 凯利）
            <span className="ml-2 text-xs text-faint">
              输入赔率与你的概率估计，看这笔的数学性价比指标
            </span>
          </span>
          <span className="text-faint">›</span>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <ValueIndicatorTool />
        </div>
      </details>

      {/* 第 0 章第 3 条：输出旁固定展示，不得移除 */}
      <p className="mt-6 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        {DISCLAIMER}
      </p>
    </div>
  );
}
