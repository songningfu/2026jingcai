"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device-id";
import type { ModelOption, ModelTier } from "@/lib/models";
import type { PreviewReport } from "@/lib/reports";

const TIER_BADGE: Record<ModelTier, string> = {
  flagship: "旗舰",
  advanced: "进阶",
  entry: "入门",
};

/**
 * AI 报告面板。
 * - 已有报告：点击后播放短动画再分块揭示（节奏感）。
 * - 没有报告：点击触发 /api/reports/on-demand 现场生成，动画陪伴真实等待。
 * - 展示层：双方数据对比条 + 引言卡 + 图标网格 + 数字自动高亮，避免纯文字墙。
 */

export interface TeamStats {
  name: string;
  count: number;
  avgAge: number | null;
  clubs: number;
}

const STEPS = [
  "读取双方大名单",
  "解析竞彩官方赔率",
  "比对近期状态数据",
  "调用 AI 生成中性分析",
  "合规过滤与排版",
];

/** 文本里的数字/百分比自动用记分牌字体高亮 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:\.\d+)?%?)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={i} className="font-num font-semibold text-neon">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** 双向对比条：左右两队同一指标 */
function CompareBar({
  label,
  left,
  right,
  unit,
}: {
  label: string;
  left: number;
  right: number;
  unit?: string;
}) {
  const max = Math.max(left, right) || 1;
  return (
    <div className="grid grid-cols-[4rem_1fr_5.5rem_1fr_4rem] items-center gap-2 text-xs">
      <span className="font-num text-right text-sm font-bold tabular-nums text-ink">
        {left}
        {unit}
      </span>
      <div className="flex justify-end">
        <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
          <div
            className="anim-grow-bar ml-auto h-full rounded-full bg-neon/80"
            style={{ width: `${(left / max) * 100}%`, transformOrigin: "right" }}
          />
        </div>
      </div>
      <span className="text-center text-faint">{label}</span>
      <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
        <div
          className="anim-grow-bar h-full rounded-full bg-amber/70"
          style={{ width: `${(right / max) * 100}%` }}
        />
      </div>
      <span className="font-num text-sm font-bold tabular-nums text-ink">
        {right}
        {unit}
      </span>
    </div>
  );
}

const BASIC_META = [
  { key: "lineup", icon: "⚽", label: "阵容" },
  { key: "injuries", icon: "🏥", label: "伤停" },
  { key: "recent_form", icon: "📈", label: "近期状态" },
  { key: "h2h", icon: "🤝", label: "历史交锋" },
] as const;

const INSIGHT_META = [
  { key: "attack_defense", icon: "⚔️", label: "攻防对位" },
  { key: "key_players", icon: "⭐", label: "关键球员" },
  { key: "form_curve", icon: "📉", label: "状态曲线" },
] as const;

export default function AiReportPanel({
  matchId,
  initialReport,
  models,
  homeStats,
  awayStats,
}: {
  matchId: number;
  initialReport: PreviewReport | null;
  models: ModelOption[];
  homeStats: TeamStats | null;
  awayStats: TeamStats | null;
}) {
  const [phase, setPhase] = useState<"idle" | "analyzing" | "done" | "error">(
    initialReport ? "done" : "idle",
  );
  const [report, setReport] = useState<PreviewReport | null>(initialReport);
  // 默认选第一个模型
  const [selectedModelId, setSelectedModelId] = useState<string>(
    () => models[0]?.id ?? "",
  );
  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const deepCost = selectedModel?.cost ?? 200;
  const [step, setStep] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [deepUnlocked, setDeepUnlocked] = useState(false);
  const [deepBusy, setDeepBusy] = useState(false);
  const [deepMsg, setDeepMsg] = useState("");
  const [pointsAfterUnlock, setPointsAfterUnlock] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    import("@/lib/account-status").then(({ fetchLoginState }) => {
      fetchLoginState().then(setIsLoggedIn);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  const start = async () => {
    setStep(0);
    setPhase("analyzing");
    // 步骤推进：有现成报告快放（1.6s 走完），现场生成慢放（每 9s 一步，停在最后一步）
    const interval = report ? 320 : 9000;
    stepTimer.current = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      interval,
    );

    if (report) {
      setTimeout(() => setPhase("done"), 1700);
      return;
    }
    try {
      const res = await fetch("/api/reports/on-demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setReport(data.report);
      setPhase("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "生成失败，请稍后重试");
      setPhase("error");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
    }
  };

  const unlockDeep = async () => {
    if (!isLoggedIn) {
      setDeepMsg("请先登录账号后再解锁深度推演");
      return;
    }
    setDeepBusy(true);
    setDeepMsg("");
    try {
      const deviceId = getDeviceId();
      const res = await fetch("/api/reports/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, matchId, modelId: selectedModelId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || "解锁失败");
      setDeepUnlocked(true);
      setPointsAfterUnlock(typeof data.points === "number" ? data.points : null);
      setDeepMsg(data.message ?? "已解锁深度推演");
    } catch (e) {
      setDeepMsg(e instanceof Error ? e.message : "解锁失败，请稍后重试");
    } finally {
      setDeepBusy(false);
    }
  };

  /* ---------- 入口 / 加载 / 错误 ---------- */

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={start}
        className="card group w-full px-6 py-9 text-center transition hover:border-neon/50 hover:shadow-[0_4px_20px_rgba(12,157,104,0.1)]"
      >
        <span className="font-num block text-xs font-semibold tracking-[0.3em] text-neon">
          ⚡ AI 数据分析 · MATCH ANALYSIS
        </span>
        <span className="mt-2 block text-lg font-semibold text-ink transition group-hover:text-neon">
          ▶ 启动 AI 数据分析
        </span>
        <span className="mt-1 block text-xs text-faint">
          全球顶尖大模型驱动 · {report ? "报告已就绪，点击查看" : "现场生成约需 1 分钟"} · 中性分析，不构成购彩建议
        </span>
      </button>
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="card relative overflow-hidden px-6 py-9">
        <div className="anim-scan pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-neon/10 to-transparent" />
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="anim-think h-2 w-2 rounded-full bg-neon"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <div className="space-y-1.5 text-center">
            {STEPS.map((s, i) => (
              <p
                key={s}
                className={`text-xs transition-colors ${
                  i < step ? "text-faint line-through" : i === step ? "text-neon" : "text-faint/50"
                }`}
              >
                {i < step ? "✓ " : ""}
                {s}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error" || !report) {
    return (
      <div className="card border-live/30 px-6 py-8 text-center">
        <p className="text-sm text-live">{errMsg || "生成失败"}</p>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="mt-3 rounded-lg border border-line px-4 py-1.5 text-sm text-mut hover:text-ink"
        >
          重试
        </button>
      </div>
    );
  }

  /* ---------- 报告呈现 ---------- */

  const showCompare =
    homeStats && awayStats && (homeStats.avgAge !== null || awayStats.avgAge !== null);

  return (
    <div className="space-y-4">
      {/* 双方硬数据对比 */}
      {showCompare && (
        <section className="card anim-fade-up p-5">
          <div className="mb-4 flex items-center justify-between text-sm font-semibold">
            <span className="text-neon">{homeStats.name}</span>
            <span className="text-xs font-normal text-faint">名单数据对比</span>
            <span className="text-amber">{awayStats.name}</span>
          </div>
          <div className="space-y-3">
            <CompareBar label="名单人数" left={homeStats.count} right={awayStats.count} />
            {homeStats.avgAge !== null && awayStats.avgAge !== null && (
              <CompareBar
                label="平均年龄"
                left={homeStats.avgAge}
                right={awayStats.avgAge}
                unit="岁"
              />
            )}
            <CompareBar label="效力俱乐部" left={homeStats.clubs} right={awayStats.clubs} />
          </div>
        </section>
      )}

      {/* AI 赛前分析：引言卡 */}
      <section
        className="card anim-fade-up relative overflow-hidden p-6"
        style={{ animationDelay: "100ms" }}
      >
        <span className="font-num pointer-events-none absolute -top-3 left-4 text-7xl text-neon/10">
          &ldquo;
        </span>
        <p className="font-num text-xs font-semibold tracking-[0.25em] text-neon">
          ⚡ AI 数据分析 · 赛前分析
        </p>
        <p className="mt-3 text-[15px] leading-loose text-ink/90">
          <Rich text={report.ai_preview} />
        </p>
      </section>

      {/* 基本面：2×2 图标网格 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {BASIC_META.map((m, i) => (
          <section
            key={m.key}
            className="card anim-fade-up p-5"
            style={{ animationDelay: `${180 + i * 80}ms` }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span aria-hidden>{m.icon}</span>
              {m.label}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-mut">
              <Rich text={report.basic[m.key]} />
            </p>
          </section>
        ))}
      </div>

      {/* 数据洞察：左色条行卡 */}
      <section className="card anim-fade-up p-5" style={{ animationDelay: "420ms" }}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="h-3 w-1 rounded-full bg-neon" />
          数据洞察
        </h3>
        <div className="space-y-3">
          {INSIGHT_META.map((m) => (
            <div key={m.key} className="rounded-lg border-l-2 border-neon/50 bg-raised/60 p-3">
              <p className="text-xs font-medium text-neon">
                {m.icon} {m.label}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-mut">
                <Rich text={report.data_insight[m.key]} />
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 市场价格信息 */}
      <section className="card anim-fade-up p-5" style={{ animationDelay: "500ms" }}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="h-3 w-1 rounded-full bg-amber" />
          市场价格信息
        </h3>
        <p className="text-sm leading-relaxed text-mut">
          <Rich text={report.odds_reading} />
        </p>
        <p className="mt-2 text-xs text-faint">以上为竞彩官方公开价格的客观描述，非任何形式的建议。</p>
      </section>

      {/* 深度推演：积分权益 */}
      <section
        className="card anim-fade-up relative overflow-hidden border-amber/25 p-5"
        style={{ animationDelay: "620ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber">
              <span className="h-3 w-1 rounded-full bg-amber" />
              🔬 深度推演
              <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-normal">
                {deepUnlocked ? "已解锁" : `${selectedModel?.name ?? "模型"} · ${deepCost} 积分`}
              </span>
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              选择大模型开启单场深度推演，查看战术变量、人员变量、状态曲线与赔率结构的整合分析。
              <strong>模型越强消耗积分越多</strong>；积分仅来自签到、竞猜和活动，不可充值、不可提现。
            </p>
          </div>
          {!deepUnlocked && (
            <button
              type="button"
              onClick={unlockDeep}
              disabled={deepBusy}
              className="shrink-0 rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:bg-raised disabled:text-faint"
            >
              {deepBusy ? "开启中…" : `开启推演 · ${deepCost} 积分`}
            </button>
          )}
        </div>
        {deepMsg && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              deepUnlocked ? "bg-neon/10 text-neon" : "border border-amber/20 bg-amber/5 text-amber"
            }`}
          >
            {deepMsg}
            {pointsAfterUnlock !== null ? `，当前剩余 ${pointsAfterUnlock} 积分` : ""}
          </p>
        )}
        {deepUnlocked ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-raised/70 p-4">
              <p className="text-xs font-medium text-amber">战术变量</p>
              <p className="mt-2 text-sm leading-relaxed text-mut">
                <Rich text={report.data_insight.attack_defense} />
              </p>
            </div>
            <div className="rounded-lg bg-raised/70 p-4">
              <p className="text-xs font-medium text-amber">人员变量</p>
              <p className="mt-2 text-sm leading-relaxed text-mut">
                <Rich text={report.data_insight.key_players} />
              </p>
            </div>
            <div className="rounded-lg bg-raised/70 p-4">
              <p className="text-xs font-medium text-amber">状态曲线</p>
              <p className="mt-2 text-sm leading-relaxed text-mut">
                <Rich text={report.data_insight.form_curve} />
              </p>
            </div>
            <div className="rounded-lg bg-raised/70 p-4">
              <p className="text-xs font-medium text-amber">赔率结构</p>
              <p className="mt-2 text-sm leading-relaxed text-mut">
                <Rich text={report.odds_reading} />
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2" aria-hidden>
            <div className="h-3 w-11/12 rounded bg-raised" />
            <div className="h-3 w-4/5 rounded bg-raised" />
            <div className="h-3 w-3/5 rounded bg-raised" />
          </div>
        )}
      </section>

      <section className="card anim-fade-up p-5" style={{ animationDelay: "700ms" }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-ink">
            选择推演大模型
            <span className="ml-2 text-xs font-normal text-faint">越强越深，消耗积分越多</span>
          </div>
          <select
            aria-label="选择推演大模型"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition hover:border-neon/40 focus:border-neon sm:min-w-64"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {TIER_BADGE[m.tier]} · {m.cost}积分
              </option>
            ))}
          </select>
        </div>
        {selectedModel && (
          <p className="mt-2 text-xs text-faint">
            {selectedModel.provider} · {selectedModel.origin === "intl" ? "国外" : "国产"} ·{" "}
            {selectedModel.blurb}
          </p>
        )}
      </section>
    </div>
  );
}
