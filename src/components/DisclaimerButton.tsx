"use client";
import { useState, useRef, useEffect } from "react";
import { DISCLAIMER } from "@/lib/odds";

export default function DisclaimerButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-raised text-ink" : "text-faint hover:bg-raised hover:text-mut"
        }`}
        title="合规声明"
        aria-label="合规声明"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" strokeLinecap="round"/>
          <path strokeLinecap="round" d="M12 8v1M12 11v5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-line bg-pitch shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="text-xs font-semibold text-ink">合规声明</p>
          </div>
          <div className="px-4 py-3 space-y-2 text-[11px] leading-relaxed text-faint">
            <p>统计概率为信息整理，量化比赛不确定性，<span className="text-mut font-medium">不预测胜负、不承诺准确率、不构成购彩建议。</span></p>
            <p>{DISCLAIMER}</p>
            <p className="text-[10px] text-faint/60">本站为体育数据资讯与工具平台，仅提供信息整理与数据分析，不提供任何投注、代购、代投服务，不设任何购彩入口。</p>
          </div>
        </div>
      )}
    </div>
  );
}
