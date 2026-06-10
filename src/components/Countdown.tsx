"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

/** 距目标时间的倒计时（天/时/分/秒），到点后显示「比赛进行中」 */
export default function Countdown({ target, label }: { target: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 服务端渲染与首帧保持占位，避免水合不一致
  if (now === null) {
    return <div className="h-16" aria-hidden />;
  }

  const diff = new Date(target).getTime() - now;
  if (diff <= 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-live">
        <span className="anim-pulse-dot h-2 w-2 rounded-full bg-live" />
        {label} 进行中
      </p>
    );
  }

  const d = Math.floor(diff / 86400_000);
  const h = Math.floor((diff % 86400_000) / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const cells = [
    ...(d > 0 ? [[String(d), "天"]] : []),
    [pad(h), "时"],
    [pad(m), "分"],
    [pad(s), "秒"],
  ];

  return (
    <div>
      <p className="text-xs text-mut">距 {label} 开球</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {cells.map(([v, unit]) => (
          <span key={unit} className="flex items-baseline gap-0.5">
            <span className="font-num min-w-9 rounded-md bg-raised px-1.5 py-0.5 text-center text-2xl font-bold tabular-nums text-ink">
              {v}
            </span>
            <span className="text-xs text-faint">{unit}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
