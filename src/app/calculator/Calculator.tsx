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

      {/* 第 0 章第 3 条：输出旁固定展示，不得移除 */}
      <p className="mt-6 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        {DISCLAIMER}
      </p>
    </div>
  );
}
