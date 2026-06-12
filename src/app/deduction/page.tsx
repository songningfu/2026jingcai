"use client";

import { useEffect, useRef, useState } from "react";
import NeuralCanvas from "./NeuralCanvas";
import ScoreHeatmap from "./ScoreHeatmap";

interface DeepModelResult {
  hasOdds: boolean;
  marketProb: { win: number; draw: number; loss: number };
  modelProb: { win: number; draw: number; loss: number };
  expectedGoals: { home: number; away: number };
  topScores: { home: number; away: number; prob: number }[];
  ranges: { bothScore: number; over25: number; under25: number };
  confidence: number;
  returnRate: number | null;
  steps: { label: string; detail: string }[];
}

interface Match {
  id: number;
  home: string;
  away: string;
  kickoff: string;
  group: string | null;
  stage: string;
}

type RunState = "idle" | "running" | "done" | "error";

const STEP_LABELS = [
  "读取竞彩官方赔率",
  "去水位计算市场概率",
  "拟合双变量泊松参数",
  "Dixon-Coles 低比分修正",
  "展开比分概率矩阵",
  "聚合赛果区间概率",
];

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;

function MatchCard({ match }: { match: Match }) {
  const [state, setState] = useState<RunState>("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<DeepModelResult | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = async () => {
    if (state === "running") return;
    setState("running");
    setStepIdx(0);
    setResult(null);
    setErrMsg("");
    timerRef.current = setInterval(() => {
      setStepIdx((s) => Math.min(s + 1, STEP_LABELS.length - 1));
    }, 750);
    try {
      const res = await fetch("/api/deep-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "计算失败");
      setResult(data.result as DeepModelResult);
      setState("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "计算失败，请稍后重试");
      setState("error");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const reset = () => { setState("idle"); setResult(null); setErrMsg(""); setStepIdx(0); };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {match.group && <span className="chip shrink-0">{match.group}</span>}
            <span className="text-xs text-faint shrink-0">{timeFmt.format(new Date(match.kickoff))}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-semibold text-ink text-base truncate">{match.home}</span>
            <span className="font-num text-sm text-faint shrink-0">vs</span>
            <span className="font-semibold text-ink text-base truncate">{match.away}</span>
          </div>
        </div>
        {state === "idle" && (
          <button onClick={run} className="ml-4 shrink-0 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">推演</button>
        )}
        {state !== "idle" && state !== "running" && (
          <button onClick={reset} className="ml-4 shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-mut transition hover:bg-raised">重置</button>
        )}
      </div>

      {state === "running" && (
        <div className="border-t border-line">
          <div className="relative h-40 w-full bg-pitch">
            <NeuralCanvas active className="absolute inset-0" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <span className="font-num text-xs tracking-widest text-neon/80 uppercase">正在推演</span>
              <div className="flex gap-1 mt-1">
                {STEP_LABELS.map((_, i) => (
                  <div key={i} className={`h-1 w-6 rounded-full transition-all duration-500 ${i <= stepIdx ? "bg-neon" : "bg-line"}`} />
                ))}
              </div>
              <span className="text-xs text-mut mt-1">{STEP_LABELS[stepIdx]}</span>
            </div>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="border-t border-line px-5 py-4">
          <p className="text-sm text-live">{errMsg}</p>
        </div>
      )}

      {state === "done" && result && (
        <div className="border-t border-line">
          <div className="relative h-28 w-full overflow-hidden bg-pitch">
            <NeuralCanvas active={false} className="absolute inset-0 opacity-40" />
            <div className="absolute inset-0 flex items-center justify-center px-6 gap-3">
              {([
                { label: match.home + " 胜", val: result.modelProb.win, colorCls: "bg-neon" },
                { label: "平", val: result.modelProb.draw, colorCls: "bg-amber" },
                { label: match.away + " 胜", val: result.modelProb.loss, colorCls: "bg-mut" },
              ] as { label: string; val: number; colorCls: string }[]).map((item) => (
                <div key={item.label} className="flex-1 text-center">
                  <div className="font-num text-xl font-bold tabular-nums text-ink">{PCT(item.val)}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                    <div className={`h-full rounded-full ${item.colorCls} transition-all duration-700`} style={{ width: PCT(item.val) }} />
                  </div>
                  <div className="mt-1 text-xs text-mut truncate">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px border-t border-line bg-line text-center">
            {[
              { label: "期望进球", val: `${result.expectedGoals.home} - ${result.expectedGoals.away}` },
              { label: "双方均进", val: PCT(result.ranges.bothScore) },
              { label: "大于2.5球", val: PCT(result.ranges.over25) },
            ].map((c) => (
              <div key={c.label} className="bg-surface py-3 px-2">
                <div className="font-num text-base font-bold tabular-nums text-ink">{c.val}</div>
                <div className="text-xs text-faint mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-line p-4">
            <p className="mb-3 text-xs font-semibold text-ink">比分概率分布</p>
            <ScoreHeatmap scores={result.topScores} homeLabel={match.home} awayLabel={match.away} />
          </div>
          <details className="border-t border-line group">
            <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-xs text-mut hover:text-ink list-none">
              <span>查看推演过程</span>
              <span className="group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-5 pb-4 space-y-2">
              {result.steps.map((s, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="font-num tabular-nums text-neon shrink-0 w-4">{i + 1}</span>
                  <div><span className="font-medium text-ink">{s.label}</span><span className="ml-2 text-mut">{s.detail}</span></div>
                </div>
              ))}
            </div>
          </details>
          <div className="border-t border-line px-5 py-3 text-xs text-faint">
            以上为统计模型量化，非预测胜负，不构成购彩建议。置信度 {(result.confidence * 100).toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeductionPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deduction/matches")
      .then((r) => r.json())
      .then((d) => { if (d.matches) setMatches(d.matches); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-surface border border-line">
        <div className="relative h-32 w-full">
          <NeuralCanvas active className="absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="font-num text-xs tracking-[0.3em] text-neon uppercase">Deep Model</div>
              <div className="mt-1 text-xl font-bold text-ink">深度推演</div>
            </div>
          </div>
        </div>
        <p className="px-6 pb-5 pt-4 text-sm text-mut leading-relaxed">
          基于竞彩官方赔率，通过赔率去水位 + 双变量泊松分布 + Dixon-Coles 修正，量化每场比赛的比分概率分布。结果为统计模型输出，量化不确定性，<strong className="text-ink">非预测胜负</strong>。
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="card h-24 animate-pulse bg-raised" />)}</div>
      ) : matches.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-faint">暂无近期赛程数据</div>
      ) : (
        <div className="space-y-4">{matches.map((m) => <MatchCard key={m.id} match={m} />)}</div>
      )}

      <p className="rounded-xl border border-amber/20 bg-amber/5 px-4 py-3 text-xs text-amber/80 leading-relaxed">
        统计概率为信息整理，量化比赛不确定性，不预测胜负、不承诺准确率、不构成购彩建议。理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </div>
  );
}
