"use client";

import { useEffect, useState } from "react";
import type { PreviewReport } from "@/lib/reports";

/**
 * AI 报告展示面板：点击触发「分析中」动画，随后分区块交错浮现。
 * 报告内容是赛前预生成的（preview_json），动画为展示节奏设计。
 */

const ANALYZE_MS = 1600;

const STEPS = ["读取双方大名单", "解析竞彩官方赔率", "比对近期状态数据", "生成中性分析"];

function Field({ label, text, delay }: { label: string; text: string; delay: number }) {
  return (
    <div className="anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <span className="mr-2 inline-block rounded bg-neon/10 px-1.5 py-0.5 text-xs text-neon">
        {label}
      </span>
      <span className="text-sm leading-relaxed text-ink/90">{text}</span>
    </div>
  );
}

function Block({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section className="card anim-fade-up p-5" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="h-3 w-1 rounded-full bg-neon" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function AiReportPanel({ report }: { report: PreviewReport | null }) {
  const [phase, setPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (phase !== "analyzing") return;
    const stepTimer = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      ANALYZE_MS / STEPS.length,
    );
    const doneTimer = setTimeout(() => setPhase("done"), ANALYZE_MS);
    return () => {
      clearInterval(stepTimer);
      clearTimeout(doneTimer);
    };
  }, [phase]);

  if (!report) {
    return (
      <div className="card border-dashed px-6 py-10 text-center">
        <p className="text-sm text-mut">本场 AI 数据报告生成中，临近开赛自动发布。</p>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setPhase("analyzing");
        }}
        className="card group relative w-full overflow-hidden px-6 py-10 text-center transition hover:border-neon/50"
      >
        <span className="font-num block text-xs font-semibold tracking-[0.3em] text-faint">
          AI MATCH REPORT
        </span>
        <span className="mt-2 block text-lg font-semibold text-ink group-hover:text-neon">
          ▶ 启动 AI 数据分析
        </span>
        <span className="mt-1 block text-xs text-faint">
          基于大名单与竞彩官方赔率 · 中性分析 · 不构成购彩建议
        </span>
      </button>
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="card relative overflow-hidden px-6 py-10">
        {/* 扫描线 */}
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

  return (
    <div className="space-y-4">
      <Block title="AI 赛前分析" delay={0}>
        <p className="text-sm leading-relaxed text-ink/90">{report.ai_preview}</p>
      </Block>
      <Block title="基本面" delay={120}>
        <Field label="阵容" text={report.basic.lineup} delay={200} />
        <Field label="伤停" text={report.basic.injuries} delay={280} />
        <Field label="近期状态" text={report.basic.recent_form} delay={360} />
        <Field label="历史交锋" text={report.basic.h2h} delay={440} />
      </Block>
      <Block title="数据洞察" delay={240}>
        <Field label="攻防" text={report.data_insight.attack_defense} delay={320} />
        <Field label="关键球员" text={report.data_insight.key_players} delay={400} />
        <Field label="状态曲线" text={report.data_insight.form_curve} delay={480} />
      </Block>
      <Block title="市场价格信息" delay={360}>
        <p className="text-sm leading-relaxed text-ink/90">{report.odds_reading}</p>
        <p className="text-xs text-faint">以上为竞彩官方公开价格的客观描述，非任何形式的建议。</p>
      </Block>

      {/* 深度分析：订阅预留位 */}
      <section
        className="card anim-fade-up relative overflow-hidden border-amber/20 p-5"
        style={{ animationDelay: "480ms" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber">
            <span className="h-3 w-1 rounded-full bg-amber" />
            深度分析
            <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-normal">
              订阅尊享 · 即将上线
            </span>
          </h3>
          <span className="text-amber/60">🔒</span>
        </div>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-3 w-11/12 rounded bg-raised" />
          <div className="h-3 w-4/5 rounded bg-raised" />
          <div className="h-3 w-3/5 rounded bg-raised" />
        </div>
        <p className="mt-3 text-xs text-faint">
          战术热区拆解、定位球攻防对位、换人影响模拟——订阅功能筹备中，当前全部基础内容免费。
        </p>
      </section>
    </div>
  );
}
