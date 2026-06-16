"use client";

import { useEffect, useRef, useState } from "react";
import type { DeepModelResult } from "@/lib/deep-model";

/**
 * 深度推演面板：点击启动真实概率模型，播放多步建模管线动画后揭示结果。
 * 合规：输出为「对不确定性的量化」，非预测胜负；全程带免责，不出现任何投注倾向。
 */

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;

function ProbBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-mut">{label}</span>
        <span className="font-num font-bold tabular-nums text-ink">{PCT(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-raised">
        <div
          className="anim-grow-bar h-full rounded-full"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function DeepModelPanel({ matchId }: { matchId: number }) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<DeepModelResult | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const STEP_LABELS = result
    ? result.steps.map((s) => s.label)
    : ["把水分榨掉", "算两队各自能进几球", "低比分场景单独校准", "列出所有比分，逐一算概率", "汇总结果，输出概率分布"];

  const start = async () => {
    setStep(0);
    setPhase("running");
    try {
      const res = await fetch("/api/deep-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "推演失败");
      // 动画逐步推进（每步 ~700ms），跑完再揭示
      const total = (data.result.steps as DeepModelResult["steps"]).length;
      let i = 0;
      timer.current = setInterval(() => {
        i += 1;
        setStep(i);
        if (i >= total) {
          if (timer.current) clearInterval(timer.current);
          setResult(data.result);
          setTimeout(() => setPhase("done"), 400);
        }
      }, 700);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "推演失败");
      setPhase("error");
    }
  };

  /* 入口 */
  if (phase === "idle") {
    return (
      <button
        onClick={start}
        className="card group w-full overflow-hidden border-amber/30 px-6 py-9 text-center transition hover:shadow-[0_4px_20px_rgba(185,122,10,0.12)]"
      >
        <span className="font-num block text-xs font-semibold tracking-[0.3em] text-amber">
          🔬 深度推演 · DEEP MODEL
        </span>
        <span className="mt-2 block text-lg font-semibold text-ink">▶ 运行概率推演模型</span>
        <span className="mt-1 block text-xs text-faint">
          赔率去水位 + 双变量泊松 + Dixon-Coles · 量化不确定性，非预测胜负
        </span>
        <span className="mt-3 inline-block rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[10px] text-amber">
          订阅尊享 · 体验版免费
        </span>
      </button>
    );
  }

  /* 运行动画 */
  if (phase === "running" || !result) {
    return (
      <div className="card relative overflow-hidden border-amber/20 px-6 py-9">
        <div className="anim-scan pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-amber/10 to-transparent" />
        <p className="mb-4 text-center font-num text-xs font-semibold tracking-[0.3em] text-amber">
          深度推演模型运行中
        </p>
        <div className="mx-auto max-w-sm space-y-2">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                i < step
                  ? "text-mut"
                  : i === step
                    ? "bg-amber/5 text-amber"
                    : "text-faint/40"
              }`}
            >
              <span className="font-num w-5 text-center">
                {i < step ? "✓" : i === step ? "▸" : i + 1}
              </span>
              {label}
              {i === step && (
                <span className="ml-auto flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="anim-think h-1.5 w-1.5 rounded-full bg-amber"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="card border-live/30 px-6 py-8 text-center">
        <p className="text-sm text-live">{err}</p>
        <button
          onClick={() => setPhase("idle")}
          className="mt-3 rounded-lg border border-line px-4 py-1.5 text-sm text-mut hover:text-ink"
        >
          重试
        </button>
      </div>
    );
  }

  /* 结果 */
  const maxScore = result.topScores[0]?.prob ?? 1;
  return (
    <div className="space-y-4">
      {/* 概率分布 */}
      <section className="card anim-fade-up border-amber/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-3 w-1 rounded-full bg-amber" />
            🔬 深度推演 · 赛果概率分布
          </h3>
          <span className="font-num text-xs text-faint">
            置信度 {(result.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="space-y-3">
          <ProbBar label="主胜" value={result.modelProb.win} color="var(--color-neon)" />
          <ProbBar label="平局" value={result.modelProb.draw} color="var(--color-amber)" />
          <ProbBar label="客胜" value={result.modelProb.loss} color="var(--color-mut)" />
        </div>
        <p className="mt-3 text-xs text-faint">
          置信度为模型分布集中度，<strong>非准确率</strong>；概率为模型测算，量化比赛不确定性，
          <strong>非预测胜负</strong>。
        </p>
      </section>

      {/* 期望进球 + 区间 */}
      <section className="card anim-fade-up border-amber/20 p-5" style={{ animationDelay: "80ms" }}>
        <h3 className="mb-3 text-sm font-semibold text-ink">期望进球与区间</h3>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            { k: "λ 主队", v: result.expectedGoals.home.toFixed(2) },
            { k: "λ 客队", v: result.expectedGoals.away.toFixed(2) },
            { k: "双方进球", v: PCT(result.ranges.bothScore) },
            { k: "总进球>2.5", v: PCT(result.ranges.over25) },
          ].map((x) => (
            <div key={x.k} className="rounded-lg bg-raised p-3">
              <div className="font-num text-xl font-bold tabular-nums text-amber">{x.v}</div>
              <div className="mt-0.5 text-xs text-faint">{x.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 最可能比分 */}
      <section className="card anim-fade-up border-amber/20 p-5" style={{ animationDelay: "160ms" }}>
        <h3 className="mb-3 text-sm font-semibold text-ink">最可能比分 Top 6</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {result.topScores.map((s, i) => (
            <div
              key={`${s.home}-${s.away}`}
              className={`rounded-lg p-2 text-center ${i === 0 ? "bg-amber/10 ring-1 ring-amber/30" : "bg-raised"}`}
            >
              <div className="font-num text-lg font-bold tabular-nums text-ink">
                {s.home}-{s.away}
              </div>
              <div className="font-num text-xs tabular-nums text-amber">{PCT(s.prob)}</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-amber/60"
                  style={{ width: `${(s.prob / maxScore) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 方法学（过程透明化，增强可信但克制） */}
      <section className="card anim-fade-up border-amber/20 p-5" style={{ animationDelay: "240ms" }}>
        <h3 className="mb-3 text-sm font-semibold text-ink">建模过程</h3>
        <ol className="space-y-2">
          {result.steps.map((s, i) => (
            <li key={s.label} className="flex gap-3 text-sm">
              <span className="font-num text-amber">{i + 1}</span>
              <div>
                <span className="text-ink">{s.label}</span>
                <span className="ml-2 text-xs text-faint">{s.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        本模型基于公开赔率与统计方法测算各结果的概率分布，目的是帮助理解比赛的不确定性，
        <strong>不预测胜负、不承诺任何准确率，亦不构成任何购彩建议</strong>。理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </div>
  );
}
