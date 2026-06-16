"use client";

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NeuralCanvas from "./NeuralCanvas";
import ScoreHeatmap from "./ScoreHeatmap";
import TournamentGraph from "./TournamentGraph";
import { listModelOptions, TIER_LABEL, canUseModel, type SubTier } from "@/lib/models";
import { getDeviceId } from "@/lib/device-id";
import LoginModal from "@/app/account/LoginModal";

interface AIAnalysis {
  tactical: string;
  keyFactors: string[];
  modelInsight: string;
  uncertainty: string;
}

interface DeepModelResult {
  hasOdds: boolean;
  marketProb: { win: number; draw: number; loss: number };
  modelProb: { win: number; draw: number; loss: number };
  expectedGoals: { home: number; away: number };
  topScores: { home: number; away: number; prob: number }[];
  ranges: { bothScore: number; over25: number; under25: number };
  totalGoals?: number[];
  confidence: number;
  returnRate: number | null;
  steps: { label: string; detail: string }[];
  aiAnalysis: AIAnalysis | null;
}

interface MatchOdds { win: number; draw: number; loss: number }
interface Match {
  id: number; home: string; away: string;
  homeLogo: string | null; awayLogo: string | null;
  kickoff: string; group: string | null; stage: string;
  homeScore: number | null; awayScore: number | null;
  odds: MatchOdds | null;
}

type RunState = "idle" | "running" | "done" | "error";
interface LogEntry { time: string; msg: string }

// 11 步流程：前 9 步假动画 + 第 9 步 AI 等待 + 第 10 步完成
const STEP_LABELS = [
  "读取竞彩官方赔率数据",
  "去水位，还原市场隐含概率",
  "拟合双变量泊松 λ 参数",
  "Dixon-Coles 低比分修正",
  "展开 8×8 比分概率矩阵",
  "聚合赛果区间概率",
  "检索赛事历史对阵记录",
  "交叉验证球队近况数据",
  "构建 AI 推演上下文",
  "AI 深度推演中…",
  "融合输出，生成分析报告",
];
const AI_STEP = 9;
const DONE_STEP = 10;

const STEP_LOG: ((id: number) => string)[] = [
  (id) => `拿到这场比赛的竞彩赔率了（#${id}）`,
  () => "把水分榨掉，看看赔率背后真实的概率是多少",
  () => "算一算两队各自大概能进几球",
  () => "低比分场景单独校准一下，小比分容易被低估",
  () => "列出所有可能的比分，一个个算概率",
  () => "汇总胜平负区间，顺便算双方都进球的概率",
  () => "翻了翻两队的历史交锋记录",
  () => "看了一眼双方的阵容状态和近期表现",
  () => "把所有数据整理好，交给 AI 来读",
  () => "AI 正在推演中，稍等一下…",
  () => "统计结果和 AI 分析合并，生成报告",
];

const STAGE_ZH: Record<string, string> = {
  group: "小组赛", round32: "1/16 决赛", round16: "1/8 决赛",
  quarter: "1/4 决赛", semi: "半决赛", third: "季军赛", final: "决赛",
};

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;
const ODD = (v: number) => v.toFixed(2);
const nowStr = () => new Date().toLocaleTimeString("zh-CN", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

function TeamFlag({ logo, name, size = 18 }: { logo: string | null; name: string; size?: number }) {
  if (logo) return <img src={logo} alt={name} width={size} height={size} className="object-contain shrink-0" />;
  return <span className="shrink-0 text-base leading-none">⚽</span>;
}

function OddsRow({ win, draw, loss, compact = false }: { win: number; draw: number; loss: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`font-num flex items-center gap-3 tabular-nums ${compact ? "text-[11px]" : "text-xs"}`}>
      <span className="text-faint text-[10px]">竞彩</span>
      <span className="text-amber">胜 {ODD(win)}</span>
      <span className="text-amber">负 {ODD(loss)}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-faint hover:text-amber transition text-[10px]"
      >
        {open ? `平 ${ODD(draw)}` : "平 ···"}
      </button>
    </div>
  );
}

function ModelSelector({ value, onChange, subTier }: { value: string; onChange: (id: string) => void; subTier: SubTier }) {
  const models = listModelOptions();
  const selected = models.find(m => m.id === value) ?? models[0];
  const effectiveCostForSelected = (() => {
    if (subTier === "max") return 0;
    if (subTier === "pro") return selected.tier === "flagship" && selected.origin === "intl" ? Math.ceil(selected.cost / 2) : selected.tier === "flagship" || selected.tier === "advanced" ? 0 : 0;
    return selected.cost;
  })();
  return (
    <div className="border-t border-line px-4 py-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-faint font-semibold">选择推演大模型</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-neon/50"
      >
        {(["flagship", "advanced", "entry"] as const).map((tier) => {
          const group = models.filter(m => m.tier === tier);
          if (!group.length) return null;
          return (
            <optgroup key={tier} label={`${TIER_LABEL[tier]}（${tier === "flagship" ? "最强" : tier === "advanced" ? "均衡" : "快速"}）`}>
              {group.map(m => {
                const cost = subTier === "max" ? 0
                  : subTier === "pro" ? (m.origin === "intl" && m.tier === "flagship" ? Math.ceil(m.cost / 2) : 0)
                  : m.cost;
                const costLabel = cost === 0 ? "免积分" : `${cost}积分`;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.provider} · {costLabel}
                  </option>
                );
              })}
            </optgroup>
          );
        })}
      </select>
      <p className="mt-1.5 text-[11px] text-faint">
        {effectiveCostForSelected === 0
          ? `${selected.blurb} · 免积分`
          : `${selected.blurb} · 消耗 ${effectiveCostForSelected} 积分`}
      </p>
    </div>
  );
}

export default function DeductionPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [awaitingAI, setAwaitingAI] = useState(false);
  const [result, setResult] = useState<DeepModelResult | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [selectedModel, setSelectedModel] = useState("claude-sonnet");
  const [logs, setLogs] = useState<LogEntry[]>([{ time: nowStr(), msg: "系统就绪，等待选择比赛..." }]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [subTier, setSubTier] = useState<SubTier>("free");
  // timerRef 已移除——全部改为 SSE 真实计算
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-49), { time: nowStr(), msg }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }, []);

  useEffect(() => {
    fetch("/api/deduction/matches")
      .then(r => r.json())
      .then(d => { if (d.matches) setMatches(d.matches); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // 登录态与订阅档位统一走服务端账号接口（国内直连 Supabase 不可靠）
    const existing = typeof window !== "undefined" ? localStorage.getItem("qiuyi_device_id") : null;
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      fetch("/api/account/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: existing }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d.ok) return;
          setIsLoggedIn(!!(d.account?.username || d.account?.email));
          if (d.account?.tier === "pro" || d.account?.tier === "max") {
            setSubTier(d.account.tier as SubTier);
          }
        })
        .catch(() => {});
    }
  }, []);

  const selectMatch = useCallback((m: Match) => {
    setSelectedMatch(m);
    setRunState("idle");
    setResult(null);
    setErrMsg("");
    setStepIdx(0);
    setAwaitingAI(false);
    addLog(`选中: ${m.home} vs ${m.away}`);
    if (m.odds) addLog(`赔率: 胜${ODD(m.odds.win)} / 平${ODD(m.odds.draw)} / 负${ODD(m.odds.loss)}`);
  }, [addLog]);

  // 每步详情（SSE 更新进来后填入）
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});

  const run = useCallback(async () => {
    if (!selectedMatch || runState === "running") return;
    setRunState("running");
    setStepIdx(0);
    setResult(null);
    setErrMsg("");
    setAwaitingAI(false);
    setStepDetails({});

    const model = listModelOptions().find(m => m.id === selectedModel);
    addLog(`启动推演 · 模型: ${model?.name ?? selectedModel}`);

    try {
      // 1. 先扣积分（同场同模型只扣一次）
      const chargeRes = await fetch("/api/deep/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), matchId: selectedMatch.id, modelId: selectedModel }),
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok || !chargeData.ok) throw new Error(chargeData.message ?? chargeData.error ?? "积分不足或开启失败");

      // 2. SSE 流式推演——每步真实计算后 emit 事件
      const res = await fetch("/api/deep-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatch.id, modelId: selectedModel }),
      });
      if (!res.ok || !res.body) throw new Error("推演服务异常");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          let event: {
            type: string; idx?: number; done?: boolean; detail?: string;
            result?: DeepModelResult; error?: string;
          };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "step") {
            const idx = event.idx ?? 0;
            if (event.done) {
              // 步骤完成：前进到下一步，记录详情
              setStepIdx(idx + 1);
              if (event.detail) {
                setStepDetails(prev => ({ ...prev, [idx]: event.detail! }));
                addLog(event.detail!);
              }
              if (idx === AI_STEP - 1) setAwaitingAI(true);
              if (idx === AI_STEP) setAwaitingAI(false);
            }
          } else if (event.type === "done") {
            setStepIdx(DONE_STEP);
            setAwaitingAI(false);
            const r = event.result!;
            setResult(r);
            setRunState("done");
            addLog(`推演完成 · 置信度 ${(r.confidence * 100).toFixed(0)}% · ${chargeData.alreadyOpen ? "已开启·免费重放" : `剩余 ${chargeData.points} 积分`}`);
            addLog(`主胜 ${PCT(r.modelProb.win)} / 平 ${PCT(r.modelProb.draw)} / 客胜 ${PCT(r.modelProb.loss)}`);
            if (r.aiAnalysis) addLog("AI 分析报告已生成");
          } else if (event.type === "error") {
            throw new Error(event.error ?? "计算失败");
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "计算失败";
      setErrMsg(msg);
      setRunState("error");
      setAwaitingAI(false);
      addLog(`× 失败: ${msg}`);
    }
  }, [selectedMatch, runState, selectedModel, addLog]);

  const reset = useCallback(() => {
    setRunState("idle"); setResult(null); setErrMsg(""); setStepIdx(0); setAwaitingAI(false); setStepDetails({});
    addLog("推演重置");
  }, [addLog]);

  const backToList = useCallback(() => {
    setSelectedMatch(null); setRunState("idle"); setResult(null);
    setErrMsg(""); setStepIdx(0); setAwaitingAI(false); setStepDetails({});
    addLog("返回赛程列表");
  }, [addLog]);

  const autoFocusGroup = selectedMatch?.group ?? null;
  const isAnalyzing = runState === "running" && awaitingAI;

  const statusDot =
    runState === "running" ? "bg-amber animate-pulse" :
    runState === "done" ? "bg-neon" :
    runState === "error" ? "bg-live" : "bg-white/20";
  const statusText = !selectedMatch ? "就绪" :
    runState === "idle" ? "等待推演" :
    awaitingAI ? "AI推演中" :
    runState === "running" ? "推演中" :
    runState === "done" ? "已完成" : "出错";

  return (
    <>
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 3.5rem)" }}>

      {/* ─── 左侧：赛事关系图谱（手机隐藏） ─── */}
      <div className="hidden md:flex md:w-[56%] flex-col border-r border-line overflow-hidden">
        <TournamentGraph
          highlightMatchId={selectedMatch?.id ?? null}
          autoFocusGroup={autoFocusGroup}
          isAnalyzing={isAnalyzing}
          onMatchSelect={(id) => {
            const m = matches.find(x => x.id === id);
            if (m) selectMatch(m);
          }}
        />
      </div>

      {/* ─── 右侧：推演工作台 ─── */}
      <div className="flex w-full md:w-[44%] flex-col overflow-hidden bg-surface">

        {/* 顶栏 */}
        <div className="flex shrink-0 items-center justify-between bg-ink px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-num text-[11px] tracking-[0.2em] text-neon">▣ 深度推演</span>
            {selectedMatch && <span className="font-num text-[11px] text-white/40">#{selectedMatch.id}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className="text-[11px] text-white/50">{statusText}</span>
          </div>
        </div>

        {/* 主内容（可滚动） */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {!selectedMatch ? (
            /* ── 赛程列表 ── */
            <div>
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="text-xs font-semibold text-ink">近期赛程</span>
                <span className="text-[11px] text-faint">点击比赛行或图谱节点</span>
              </div>

              {loading ? (
                <div className="space-y-3 p-4">
                  {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-raised" />)}
                </div>
              ) : matches.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-faint">暂无近期赛程数据</div>
              ) : (
                <div className="divide-y divide-line">
                  {matches.map(m => (
                    <button key={m.id} onClick={() => selectMatch(m)}
                      className="group w-full px-4 py-3.5 text-left transition hover:bg-raised">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.group && <span className="chip !px-1.5 !text-[10px]">{m.group}组</span>}
                          <span className="chip !px-1.5 !text-[10px]">{STAGE_ZH[m.stage] ?? m.stage}</span>
                          <span className="font-num text-[11px] text-faint">{timeFmt.format(new Date(m.kickoff))}</span>
                        </div>
                        <span className="font-num ml-2 shrink-0 text-[10px] text-neon opacity-0 transition group-hover:opacity-100">推演 →</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
                          <span className="truncate text-sm font-semibold text-ink">{m.home}</span>
                          <TeamFlag logo={m.homeLogo} name={m.home} />
                        </div>
                        <div className="shrink-0 px-1 text-center">
                          {m.homeScore !== null && m.awayScore !== null ? (
                            <span className="font-num text-base font-bold tabular-nums text-live">
                              {m.homeScore}–{m.awayScore}
                            </span>
                          ) : (
                            <span className="font-num text-xs text-faint">vs</span>
                          )}
                        </div>
                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                          <TeamFlag logo={m.awayLogo} name={m.away} />
                          <span className="truncate text-sm font-semibold text-ink">{m.away}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

            </div>

          ) : (
            /* ── 推演模式 ── */
            <div>

              {/* 比赛信息头 */}
              <div className="border-b border-line px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {selectedMatch.group && <span className="chip !px-1.5 !text-[10px]">{selectedMatch.group}组</span>}
                      <span className="chip !px-1.5 !text-[10px]">{STAGE_ZH[selectedMatch.stage] ?? selectedMatch.stage}</span>
                      <span className="font-num text-[11px] text-faint">{timeFmt.format(new Date(selectedMatch.kickoff))}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamFlag logo={selectedMatch.homeLogo} name={selectedMatch.home} size={22} />
                        <span className="font-bold text-ink truncate">{selectedMatch.home}</span>
                      </div>
                      <span className="text-sm text-faint shrink-0">vs</span>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="font-bold text-ink truncate">{selectedMatch.away}</span>
                        <TeamFlag logo={selectedMatch.awayLogo} name={selectedMatch.away} size={22} />
                      </div>
                    </div>
                  </div>
                  <button onClick={backToList} className="shrink-0 text-xs text-mut transition hover:text-ink mt-1">← 返回</button>
                </div>
              </div>

              {/* 步骤卡片 */}
              <div className="space-y-2 px-4 py-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-faint">推演流程</p>
                {STEP_LABELS.map((label, i) => {
                  const done = runState === "done" || (runState === "running" && i < stepIdx);
                  const active = runState === "running" && i === stepIdx;
                  const isAiStep = i === AI_STEP;
                  return (
                    <div key={i} className={`rounded-lg border px-3 py-2.5 transition-all ${
                      done ? "border-neon/30 bg-neon/5" :
                      active && isAiStep ? "border-amber/50 bg-amber/8 shadow-[0_0_12px_rgba(245,158,11,0.12)]" :
                      active ? "border-amber/40 bg-amber/5" :
                      "border-line opacity-40"
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`font-num w-6 text-sm font-bold tabular-nums ${done ? "text-neon" : active ? "text-amber" : "text-faint"}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={`text-xs font-medium ${done || active ? "text-ink" : "text-mut"}`}>{label}</span>
                        <span className="ml-auto shrink-0">
                          {done && <span className="text-neon text-xs font-bold">✓</span>}
                          {active && isAiStep && (
                            <span className="flex items-center gap-1">
                              <span className="anim-think inline-block h-1 w-1 rounded-full bg-amber" style={{ animationDelay: "0ms" }} />
                              <span className="anim-think inline-block h-1 w-1 rounded-full bg-amber" style={{ animationDelay: "160ms" }} />
                              <span className="anim-think inline-block h-1 w-1 rounded-full bg-amber" style={{ animationDelay: "320ms" }} />
                            </span>
                          )}
                          {active && !isAiStep && <span className="inline-block h-3 w-3 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />}
                        </span>
                      </div>
                      {(done || active) && (stepDetails[i] ?? result?.steps?.[i]?.detail) && (
                        <p className="ml-9 mt-1 text-[11px] text-faint leading-relaxed">{stepDetails[i] ?? result?.steps?.[i]?.detail}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 模型选择 + 操作按钮 */}
              {runState === "idle" && (
                <>
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} subTier={subTier} />
                  <div className="px-4 pb-4 pt-3">
                    <button
                      onClick={() => isLoggedIn ? run() : setShowLogin(true)}
                      className="w-full rounded-lg bg-neon py-3 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      {isLoggedIn ? "▶ 开始推演" : "登录后开始推演"}
                    </button>
                  </div>
                </>
              )}

              {runState === "running" && (
                <div className="px-4 pb-4">
                  <div className="relative h-10 overflow-hidden rounded-lg bg-ink">
                    <NeuralCanvas active className="absolute inset-0 opacity-40" />
                    <div className="absolute inset-0 flex items-center justify-center gap-2">
                      <span className="font-num text-xs tracking-widest text-neon/80">
                        {awaitingAI ? "AI 引擎推演中" : "统计建模中"}
                      </span>
                      {awaitingAI && (
                        <span className="flex gap-1">
                          <span className="anim-think inline-block h-1 w-1 rounded-full bg-neon/60" style={{ animationDelay: "0ms" }} />
                          <span className="anim-think inline-block h-1 w-1 rounded-full bg-neon/60" style={{ animationDelay: "160ms" }} />
                          <span className="anim-think inline-block h-1 w-1 rounded-full bg-neon/60" style={{ animationDelay: "320ms" }} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(runState === "done" || runState === "error") && (
                <div className="px-4 pb-4">
                  <button onClick={reset} className="w-full rounded-lg border border-line py-2.5 text-xs text-mut transition hover:bg-raised hover:text-ink">
                    重新推演
                  </button>
                </div>
              )}

              {runState === "error" && (
                <div className="mx-4 mb-4 space-y-3">
                  <div className="rounded-lg border border-live/20 bg-live/5 px-4 py-3">
                    <p className="text-sm text-live">{errMsg}</p>
                  </div>
                  {(errMsg.includes("积分不足") || errMsg.includes("points")) && (
                    <div className="rounded-lg border border-neon/30 bg-neon/5 px-4 py-3.5">
                      <p className="mb-1 text-xs font-semibold text-neon">积分不足？升级订阅</p>
                      <p className="mb-3 text-[11px] leading-relaxed text-faint">
                        Pro 会员每次推演免积分消耗旗舰模型，Max 会员无限次使用全部模型。
                      </p>
                      <a
                        href="/pricing"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
                      >
                        查看订阅方案 →
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* ─── 结果区域 ─── */}
              {runState === "done" && result && (
                <div className="border-t border-line">

                  {/* 概率条（神经网络背景） */}
                  <div className="relative h-28 overflow-hidden bg-pitch">
                    <NeuralCanvas active={false} className="absolute inset-0 opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
                      {(
                        [
                          { label: selectedMatch.home + " 胜", val: result.modelProb.win, cls: "bg-neon" },
                          { label: "平局", val: result.modelProb.draw, cls: "bg-amber" },
                          { label: selectedMatch.away + " 胜", val: result.modelProb.loss, cls: "bg-mut" },
                        ] as { label: string; val: number; cls: string }[]
                      ).map((item) => (
                        <div key={item.label} className="flex-1 text-center">
                          <div className="font-num text-xl font-bold tabular-nums text-ink">{PCT(item.val)}</div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                            <div className={`h-full rounded-full ${item.cls} transition-all duration-700`} style={{ width: PCT(item.val) }} />
                          </div>
                          <div className="mt-1 truncate text-[10px] text-mut">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 统计格子 */}
                  <div className="grid grid-cols-3 gap-px border-t border-line bg-line text-center">
                    {(() => {
                      const tgLabels = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
                      const tg = result.totalGoals ?? [];
                      const tgTop = tg
                        .map((p, i) => ({ label: tgLabels[i], prob: p }))
                        .sort((a, b) => b.prob - a.prob)[0];
                      return [
                        { label: "期望进球", val: `${result.expectedGoals.home.toFixed(1)}-${result.expectedGoals.away.toFixed(1)}` },
                        { label: "双方均进", val: PCT(result.ranges.bothScore) },
                        tgTop
                          ? { label: "最可能总进球", val: `${tgTop.label} ${PCT(tgTop.prob)}` }
                          : { label: "双方均进", val: PCT(result.ranges.bothScore) },
                      ];
                    })().map((c, i) => (
                      <div key={i} className="bg-surface px-2 py-3">
                        <div className="font-num text-sm font-bold tabular-nums text-ink">{c.val}</div>
                        <div className="mt-0.5 text-[10px] text-faint">{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* 比分热力图 */}
                  <div className="border-t border-line p-4">
                    <p className="mb-2 text-xs font-semibold text-ink">比分概率分布</p>
                    <ScoreHeatmap scores={result.topScores} homeLabel={selectedMatch.home} awayLabel={selectedMatch.away} />
                  </div>

                  {/* AI 分析报告 */}
                  {result.aiAnalysis && (
                    <div className="border-t border-line px-4 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-neon shrink-0" />
                        <p className="text-xs font-semibold text-ink">AI 深度分析</p>
                        <span className="font-num text-[10px] text-faint">
                          {listModelOptions().find(m => m.id === selectedModel)?.name ?? selectedModel}
                        </span>
                      </div>

                      {result.aiAnalysis.tactical && (
                        <div className="mb-3 rounded-lg bg-raised px-3 py-2.5">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">战术特点</p>
                          <p className="text-xs leading-relaxed text-ink">{result.aiAnalysis.tactical}</p>
                        </div>
                      )}

                      {result.aiAnalysis.keyFactors.length > 0 && (
                        <div className="mb-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">关键影响因素</p>
                          <div className="flex flex-wrap gap-1.5">
                            {result.aiAnalysis.keyFactors.map((f, i) => (
                              <span key={i} className="rounded-full border border-neon/20 bg-neon/5 px-2.5 py-1 text-[11px] text-neon">
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.aiAnalysis.modelInsight && (
                        <div className="mb-3 rounded-lg bg-raised px-3 py-2.5">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">模型解读</p>
                          <p className="text-xs leading-relaxed text-ink">{result.aiAnalysis.modelInsight}</p>
                        </div>
                      )}

                      {result.aiAnalysis.uncertainty && (
                        <div className="rounded-lg border border-amber/20 bg-amber/5 px-3 py-2">
                          <p className="text-[11px] leading-relaxed text-amber/80">⚠ {result.aiAnalysis.uncertainty}</p>
                        </div>
                      )}
                    </div>
                  )}


                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── 系统日志 ─── */}
        <div className="shrink-0 border-t border-black/20 bg-ink">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
            <span className="font-mono text-[10px] tracking-widest text-white/30">SYSTEM LOG</span>
            <span className="font-mono text-[10px] text-white/20">{selectedMatch ? `#${selectedMatch.id}` : "NO_MATCH"}</span>
          </div>
          <div ref={logRef} className="flex flex-col gap-1 overflow-y-auto px-4 py-2" style={{ height: "60px" }}>
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 font-mono text-[11px] leading-[1.6]">
                <span className="shrink-0 tabular-nums text-white/25">{log.time}</span>
                <span className="break-all text-white/60">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {showLogin && (
      <LoginModal
        onClose={() => setShowLogin(false)}
        onAuthChange={() => {
          setShowLogin(false);
          import("@/lib/account-status").then(({ fetchLoginState }) => {
            fetchLoginState().then(setIsLoggedIn);
          });
        }}
      />
    )}
    </>
  );
}

