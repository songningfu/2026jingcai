"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EvMatch } from "@/lib/ev-engine";
import { teamFlag } from "@/lib/team-names";
import { getDeviceId } from "@/lib/device-id";
import { activeTier, type SubTier } from "@/lib/subscriptions";

const EV_COST = 150;

// ── 使用教程弹窗 ─────────────────────────────────────────────

function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-semibold text-ink text-lg">如何使用 EV分析</h2>
            <p className="text-xs text-mut mt-0.5">5分钟看懂赔率背后的数学</p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-mut transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-raised">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 步骤1 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neon/10 text-neon font-semibold text-sm flex items-center justify-center shrink-0">1</div>
            <div>
              <p className="font-medium text-ink text-sm mb-1">选择比赛</p>
              <p className="text-xs text-mut leading-relaxed">勾选你关心的世界杯场次（可多选）。标有「精校」的场次已用专业参考盘校准模型，准确性更高。</p>
            </div>
          </div>

          {/* 步骤2 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neon/10 text-neon font-semibold text-sm flex items-center justify-center shrink-0">2</div>
            <div>
              <p className="font-medium text-ink text-sm mb-1">看懂三个关键数字</p>
              <div className="space-y-2 mt-2">
                <div className="rounded-lg bg-raised/60 p-3 text-xs">
                  <span className="text-amber font-medium">体彩赔率</span>
                  <span className="text-mut ml-2">官方给的赔率。2.05倍=猜中拿回本金×2.05。</span>
                </div>
                <div className="rounded-lg bg-raised/60 p-3 text-xs">
                  <span className="text-ink font-medium">估算命中率</span>
                  <span className="text-mut ml-2">模型算出这个结果真实发生的概率，比如35%。</span>
                </div>
                <div className="rounded-lg bg-neon/5 border border-neon/20 p-3 text-xs">
                  <span className="text-neon font-medium">长期价值（EV）</span>
                  <span className="text-mut ml-2"><strong className="text-neon">正值=划算</strong>，体彩赔率比真实概率给得更高。负值=贴水，长期亏。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 步骤3 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neon/10 text-neon font-semibold text-sm flex items-center justify-center shrink-0">3</div>
            <div>
              <p className="font-medium text-ink text-sm mb-1">三档分级怎么用</p>
              <div className="space-y-1.5 mt-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="chip bg-amber/10 text-amber shrink-0 mt-0.5">价值档</span>
                  <span className="text-mut">EV为正、长期划算，但不等于这场一定中。</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="chip bg-neon/10 text-neon shrink-0 mt-0.5">稳健档</span>
                  <span className="text-mut">命中率高（≥58%），但常含体彩抽水，不一定划算。</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="chip bg-live/10 text-live shrink-0 mt-0.5">博胆档</span>
                  <span className="text-mut">赔率5倍以上的冷门，概率极低，像彩票一样波动。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 步骤4 - 串关 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neon/10 text-neon font-semibold text-sm flex items-center justify-center shrink-0">4</div>
            <div>
              <p className="font-medium text-ink text-sm mb-1">串关和系统过关</p>
              <p className="text-xs text-mut leading-relaxed">
                <strong className="text-ink">2串1/3串1/4串1</strong>：把多场各选一个结果串在一起，全中才算赢，赔率相乘。<br/>
                <strong className="text-ink">系统过关（多串多）</strong>：自动从多场中取所有可能的组合，不用全中也能回本，但每注金额×组合数。
              </p>
            </div>
          </div>

          {/* 步骤5 - 投入计划 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-neon/10 text-neon font-semibold text-sm flex items-center justify-center shrink-0">5</div>
            <div>
              <p className="font-medium text-ink text-sm mb-1">投入金额参考</p>
              <p className="text-xs text-mut leading-relaxed">
                输入你的本金，系统用凯利公式自动算出每注建议金额：单注不超过本金2%，总投入不超过20%。这是风控数学，不是购彩建议。
              </p>
            </div>
          </div>

          {/* 免责 */}
          <div className="rounded-xl bg-raised/60 border border-line p-3 text-xs text-faint leading-relaxed">
            ⚠️ 长期价值高 ≠ 这场一定中。模型只做概率估算，结果存在随机性，单次可能全额亏损。本功能仅供数学分析参考，不构成任何购彩建议。
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-full bg-neon text-white text-sm font-medium hover:bg-neon-dim transition"
          >
            我明白了，开始分析
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 积分提示弹窗 ─────────────────────────────────────────────

function PointsModal({ points, onClose, onConfirm }: {
  points: number; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="text-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🪙</span>
          </div>
          <h3 className="font-semibold text-ink text-lg">本次分析需 {EV_COST} 积分</h3>
          <p className="text-sm text-mut mt-1">你当前有 <span className="font-num tabular-nums font-semibold text-ink">{points}</span> 积分</p>
        </div>
        <div className="rounded-xl bg-raised/60 p-3 text-xs text-mut mb-4 text-center leading-relaxed">
          首次分析免费，后续每次消耗 {EV_COST} 积分<br/><a href="/pricing" className="text-neon underline underline-offset-2">订阅 Pro/Max 后免积分无限次</a>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-line text-sm text-mut hover:bg-raised transition">取消</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-full bg-neon text-white text-sm font-medium hover:bg-neon-dim transition">
            确认扣除 {EV_COST} 积分
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────

// 端午节区间判断（客户端）
function isDuanwu(): boolean {
  const bj = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const d = bj.getFullYear() * 10000 + (bj.getMonth() + 1) * 100 + bj.getDate();
  return d >= 20260620 && d <= 20260622;
}

export default function EVClient({ matches }: { matches: EvMatch[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [going, setGoing] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPointsConfirm, setShowPointsConfirm] = useState<{ points: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [subTier, setSubTier] = useState<SubTier>("free");
  const duanwu = isDuanwu();

  // 首次访问自动弹教程
  useEffect(() => {
    const seen = localStorage.getItem("ev_tutorial_seen");
    if (!seen) setShowTutorial(true);
  }, []);

  // 读取订阅状态
  useEffect(() => {
    const id = localStorage.getItem("qiuyi_device_id");
    if (!id) return;
    fetch("/api/account/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.account) {
          setSubTier(activeTier(data.account.sub_type, data.account.sub_expires));
        }
      })
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

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

  const doNavigate = () => {
    const ids = [...selected].join(",");
    router.push(`/ev/result?ids=${ids}`);
  };

  const start = async () => {
    if (selected.size === 0 || going) return;
    setGoing(true);
    try {
      const deviceId = getDeviceId();
      const res = await fetch("/api/ev/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();

      if (res.status === 402) {
        // 积分不足
        showToast(`积分不足（需 ${EV_COST} 积分，当前 ${data.pointsLeft ?? 0} 积分）。订阅 Pro 后可免积分使用。`);
        setGoing(false);
        return;
      }
      if (!data.ok) {
        showToast(data.error ?? "服务异常，请稍后重试");
        setGoing(false);
        return;
      }

      if (data.free) {
        // 首次免费，直接跳
        doNavigate();
      } else {
        // 非首次，先弹确认（已在 gate 里扣了，这里只告知）
        doNavigate();
      }
    } catch {
      showToast("网络异常，请稍后重试");
      setGoing(false);
    }
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
    <>
      {showTutorial && (
        <TutorialModal onClose={() => {
          localStorage.setItem("ev_tutorial_seen", "1");
          setShowTutorial(false);
        }} />
      )}

      {showPointsConfirm && (
        <PointsModal
          points={showPointsConfirm.points}
          onClose={() => { setShowPointsConfirm(null); setGoing(false); }}
          onConfirm={() => { setShowPointsConfirm(null); doNavigate(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-white text-xs rounded-full px-5 py-2.5 shadow-lg max-w-xs text-center leading-relaxed">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        {/* 工作原理 */}
        <div className="rounded-xl bg-raised/60 border border-line p-4 text-xs text-mut leading-relaxed flex items-start gap-3">
          <div className="flex-1">
            <strong className="text-ink">这是什么：</strong>
            勾选你关心的比赛，模型会估算每个玩法的「真实命中率」，再和体彩官方赔率对比——
            赔率给得比真实水平高的地方，长期看就划算。结果会在下一页按场次、三档、串关展开。
            <span className="block mt-0.5 text-faint">仅供数学分析参考，不构成任何投注建议。</span>
          </div>
          <button
            onClick={() => setShowTutorial(true)}
            className="shrink-0 text-neon text-xs underline underline-offset-2 hover:text-neon-dim whitespace-nowrap"
          >
            使用教程
          </button>
        </div>

        {/* 端午节活动 banner */}
        {duanwu && (
          <div className="rounded-xl border border-amber/20 bg-amber/5 p-3 text-xs text-mut flex items-center gap-2">
            <span className="text-base shrink-0">🐉</span>
            <span><strong className="text-ink">端午节活动</strong>（6月20–22日）：EV 分析全员免费 · 签到额外 +100 积分</span>
          </div>
        )}

        {/* 积分/订阅说明 */}
        {!duanwu && (
          <div className="rounded-xl border border-amber/20 bg-amber/5 p-3 text-xs text-mut flex items-center gap-2">
            <span className="text-base shrink-0">🪙</span>
            {subTier === "pro" || subTier === "max" ? (
              <span><strong className="text-ink">{subTier === "max" ? "Max" : "Pro"} 订阅</strong> · EV 分析免积分无限次 ✓</span>
            ) : (
              <span>首次分析 <strong className="text-ink">免费</strong>，之后每次消耗 <strong className="text-ink">{EV_COST} 积分</strong> · <a href="/pricing" className="text-neon underline underline-offset-2">订阅后免费</a></span>
            )}
          </div>
        )}

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
                      <span className="font-medium text-ink text-sm">
                        {teamFlag(m.home)} {m.home} vs {teamFlag(m.away)} {m.away}
                      </span>
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
              {going ? "验证中…" : "开始分析 →"}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
