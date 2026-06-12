"use client";

import { useState } from "react";
import { getDeviceId } from "@/lib/device-id";
import type { DeepModelResult } from "@/lib/deep-model";
import type { DeepAnalysis } from "@/lib/deep-run";
import type { ModelOption, ModelTier } from "@/lib/models";

/**
 * 深度推演（合并版）：
 *  上半 = 统计模型比分概率（免费钩子，赔率去水位+双变量泊松+Dixon-Coles）
 *  下半 = 选一个大模型，扣对应积分，用「该模型」真实生成深度解读（不冒充）
 */

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;
const TIER_BADGE: Record<ModelTier, string> = { flagship: "旗舰", advanced: "进阶", entry: "入门" };

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-mut">{label}</span>
        <span className="font-num font-bold tabular-nums text-ink">{PCT(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-raised">
        <div className="anim-grow-bar h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );
}

const ANALYSIS_FIELDS: { key: keyof DeepAnalysis; icon: string; label: string }[] = [
  { key: "tactical", icon: "⚔️", label: "战术变量" },
  { key: "personnel", icon: "👥", label: "人员变量" },
  { key: "form", icon: "📈", label: "状态曲线" },
  { key: "odds_read", icon: "💹", label: "赔率结构" },
];

export default function DeepRunPanel({
  matchId,
  models,
}: {
  matchId: number;
  models: ModelOption[];
}) {
  // 统计模型（免费）
  const [stat, setStat] = useState<DeepModelResult | null>(null);
  const [statBusy, setStatBusy] = useState(false);

  // 模型解读（付费）
  const [modelId, setModelId] = useState<string>(
    () => (models.find((m) => m.available) ?? models[0])?.id ?? "",
  );
  const selected = models.find((m) => m.id === modelId) ?? null;
  const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [runModelName, setRunModelName] = useState("");

  const runStat = async () => {
    setStatBusy(true);
    try {
      const res = await fetch("/api/deep-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await res.json();
      if (data.ok) setStat(data.result);
    } finally {
      setStatBusy(false);
    }
  };

  const runModel = async () => {
    if (selected && !selected.available) {
      setRunMsg(`${selected.name} 暂未开放，敬请期待`);
      return;
    }
    setRunBusy(true);
    setRunMsg("");
    try {
      const res = await fetch("/api/deep/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), matchId, modelId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || data.error || "开启失败");
      setAnalysis(data.analysis);
      setRunModelName(data.model?.name ?? selected?.name ?? "");
      setRunMsg(
        data.alreadyOpen
          ? `已开启（${data.model?.name ?? ""}）`
          : `已消耗 ${selected?.cost ?? ""} 积分 · ${data.model?.name ?? ""} 生成`,
      );
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "开启失败，请稍后重试");
    } finally {
      setRunBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <span className="h-3 w-1 rounded-full bg-amber" />
        <h2 className="text-sm font-semibold text-ink">🔬 深度推演</h2>
        <span className="text-xs text-faint">统计比分概率免费 · 大模型解读按所选模型扣积分</span>
      </div>

      {/* 上半：统计模型比分概率（免费） */}
      {!stat ? (
        <button
          onClick={runStat}
          disabled={statBusy}
          className="card group w-full px-6 py-8 text-center transition hover:border-amber/40"
        >
          <span className="font-num block text-xs font-semibold tracking-[0.25em] text-amber">
            数据模型 · 比分概率
          </span>
          <span className="mt-2 block text-base font-semibold text-ink">
            {statBusy ? "测算中…" : "▶ 运行概率模型（免费）"}
          </span>
          <span className="mt-1 block text-xs text-faint">
            赔率去水位 + 双变量泊松 + Dixon-Coles · 量化不确定性，非预测胜负
          </span>
        </button>
      ) : (
        <section className="card anim-fade-up p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">赛果概率分布（数据模型）</h3>
            <span className="font-num text-xs text-faint">置信度 {(stat.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-3">
            <ProbBar label="主胜" value={stat.modelProb.win} color="var(--color-neon)" />
            <ProbBar label="平局" value={stat.modelProb.draw} color="var(--color-amber)" />
            <ProbBar label="客胜" value={stat.modelProb.loss} color="var(--color-mut)" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {stat.topScores.slice(0, 3).map((s, i) => (
              <div key={i} className={`rounded-lg p-2 ${i === 0 ? "bg-amber/10 ring-1 ring-amber/30" : "bg-raised"}`}>
                <div className="font-num text-lg font-bold tabular-nums text-ink">
                  {s.home}-{s.away}
                </div>
                <div className="font-num text-xs tabular-nums text-amber">{PCT(s.prob)}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">
            期望进球 主 {stat.expectedGoals.home} / 客 {stat.expectedGoals.away} ·
            概率为模型测算，量化不确定性，<strong>非预测胜负</strong>。
          </p>
        </section>
      )}

      {/* 下半：选模型 + 付费深度解读 */}
      <section className="card p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-ink">
            选择推演大模型
            <span className="ml-2 text-xs font-normal text-faint">越强越深，消耗积分越多</span>
          </div>
          <select
            aria-label="选择推演大模型"
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              setAnalysis(null);
              setRunMsg("");
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition hover:border-amber/40 focus:border-amber sm:min-w-64"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {TIER_BADGE[m.tier]} · {m.cost}积分{m.available ? "" : "（敬请期待）"}
              </option>
            ))}
          </select>
        </div>
        {selected && (
          <p className="mt-2 text-xs text-faint">
            {selected.provider} · {selected.origin === "intl" ? "国外" : "国产"} · {selected.blurb}
            {!selected.available && " · 该模型需配置密钥后开放"}
          </p>
        )}

        {!analysis && (
          <button
            onClick={runModel}
            disabled={runBusy || (selected ? !selected.available : true)}
            className="mt-4 w-full rounded-lg bg-amber py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:bg-raised disabled:text-faint"
          >
            {runBusy
              ? `${selected?.name ?? ""} 推演中…`
              : selected && !selected.available
                ? "该模型敬请期待"
                : `开启推演 · ${selected?.name ?? ""} · ${selected?.cost ?? ""} 积分`}
          </button>
        )}
        {runMsg && (
          <p className="mt-3 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber/80">
            {runMsg}
          </p>
        )}

        {analysis && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border-l-2 border-amber/50 bg-raised/60 p-4">
              <p className="text-xs font-medium text-amber">📋 综合推演 · 由 {runModelName} 生成</p>
              <p className="mt-1 text-sm leading-relaxed text-ink/90">{analysis.summary}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ANALYSIS_FIELDS.map((f) => (
                <div key={f.key} className="rounded-lg bg-raised/60 p-4">
                  <p className="text-xs font-medium text-amber">
                    {f.icon} {f.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-mut">{analysis[f.key]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        统计概率与大模型解读均为信息整理，量化比赛不确定性，<strong>不预测胜负、不承诺准确率、不构成购彩建议</strong>。
        积分纯虚拟，不可充值、不可提现。理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </div>
  );
}
