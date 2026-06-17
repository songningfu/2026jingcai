"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EvMatch } from "@/lib/ev-engine";

export default function EVClient({ matches }: { matches: EvMatch[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [going, setGoing] = useState(false);

  const toggleMatch = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === matches.length ? new Set() : new Set(matches.map(m => m.matchId))
    );
  };

  const start = () => {
    if (selected.size === 0 || going) return;
    setGoing(true);
    const ids = [...selected].join(",");
    router.push(`/ev/result?ids=${ids}`);
  };

  if (matches.length === 0) {
    return (
      <div className="card p-6 text-center text-mut text-sm">
        <p>暂无可分析的场次。</p>
        <p className="text-xs text-faint mt-1">需要近期有赔率的未开赛场次，请等待赔率同步。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* 工作原理（中性、不点名外部盘） */}
      <div className="rounded-xl bg-raised/60 border border-line p-4 text-xs text-mut leading-relaxed">
        <strong className="text-ink">这是什么：</strong>
        勾选你关心的比赛，模型会估算每个玩法的「真实命中率」，再和体彩官方赔率对比——
        赔率给得比真实水平高的地方，长期看就划算。结果会在下一页按场次、三档、串关展开。
        <span className="block mt-0.5 text-faint">仅供数学分析参考，不构成任何投注建议。</span>
      </div>

      {/* 选场 + 运行 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">选择要分析的比赛</h2>
          <button onClick={toggleAll} className="text-xs text-neon hover:text-neon-dim underline underline-offset-2">
            {selected.size === matches.length ? "取消全选" : "全选"}
          </button>
        </div>

        <div className="space-y-2">
          {matches.map(m => {
            const isSelected = selected.has(m.matchId);
            const hasRef = Object.keys(m.refMarkets).length > 0;
            const kickoff = new Date(m.kickoffAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            });
            return (
              <label
                key={m.matchId}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition ${
                  isSelected ? "border-neon/40 bg-neon/[0.03]" : "border-line bg-surface hover:bg-raised/40"
                }`}
              >
                <input
                  type="checkbox" checked={isSelected}
                  onChange={() => toggleMatch(m.matchId)}
                  className="accent-neon w-4 h-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink text-sm">{m.home} vs {m.away}</span>
                    {hasRef
                      ? <span className="chip bg-neon/10 text-neon text-xs" title="已用更专业的参考赔率校准模型">精校</span>
                      : <span className="chip text-xs text-faint" title="无参考赔率，仅用体彩自身赔率估算">自评</span>
                    }
                  </div>
                  <span className="text-xs text-faint">
                    {kickoff} · {Object.keys(m.markets).join(" · ")}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
          <span className="text-sm text-mut">已选 <span className="font-num tabular-nums text-ink">{selected.size}</span> 场</span>
          <button
            onClick={start}
            disabled={selected.size === 0 || going}
            className={`px-6 py-2 rounded-full text-sm font-medium transition ${
              selected.size === 0 || going
                ? "bg-raised text-faint cursor-not-allowed"
                : "bg-neon text-white hover:bg-neon-dim active:scale-95"
            }`}
          >
            {going ? "正在打开…" : "开始分析 →"}
          </button>
        </div>
      </section>
    </div>
  );
}
