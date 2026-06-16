"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface DayPoint { date: string; count: number }
interface Analytics {
  dauTrend: DayPoint[];
  todayActive: number;
  yesterdayActive: number;
  todayCheckins: number;
  todayActiveUsers: number;
  regTrend: DayPoint[];
  emailUsers: number;
  guestUsers: number;
  pickDist: { win: number; draw: number; loss: number };
  totalPreds: number;
  settledCount: number;
  wonCount: number;
  winRate: number;
  topPredMatches: { match_id: number; count: number; kickoff_at: string | null; status: string | null }[];
  ledgerByReason: Record<string, { count: number; totalIn: number; totalOut: number }>;
  reportCount: number;
  modelDist: Record<string, number>;
  recentUnlocks: { match_id: number; model_id: string; created_at: string }[];
  topUnlockMatches: { match_id: number; count: number }[];
}

// 迷你条形图（横向）
function MiniBar({ value, max, color = "bg-neon" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-raised overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-num w-8 text-right text-xs tabular-nums text-mut">{value}</span>
    </div>
  );
}

// 7日趋势图（竖条）
function TrendChart({ data, color = "#22c55e" }: { data: DayPoint[]; color?: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-14">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group">
          <div className="relative w-full flex items-end justify-center" style={{ height: 44 }}>
            <div
              className="w-full rounded-t transition-all duration-500"
              style={{
                height: `${Math.max(d.count / max * 44, d.count > 0 ? 3 : 0)}px`,
                backgroundColor: color,
                opacity: d.count > 0 ? 0.8 : 0.15,
              }}
            />
            {/* tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap">
              {d.date}: {d.count}
            </div>
          </div>
          <span className="text-[9px] text-faint">{d.date.slice(3)}</span>
        </div>
      ))}
    </div>
  );
}

// 数字卡片
function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] text-faint">{label}</p>
      <p className={`font-num mt-1 text-2xl font-bold tabular-nums ${accent ?? "text-ink"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

// 分区标题
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-faint">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </h2>
  );
}

const REASON_LABEL: Record<string, string> = {
  signup: "注册赠送",
  checkin: "每日签到",
  stake: "竞猜投入",
  settle_win: "竞猜获胜",
  settle_lose: "竞猜失败",
  unlock_deep_prediction: "解锁消耗",
  admin_grant: "管理员调整",
};

const MODEL_LABEL: Record<string, string> = {
  "": "基础报告",
  basic: "基础报告",
  pro: "Pro 深度",
  max: "Max 旗舰",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function AnalyticsPanel() {
  const sp = useSearchParams();
  const secret = sp.get("secret") ?? "";
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/analytics?secret=${secret}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [secret]);

  if (loading) return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-4">
      {[...Array(6)].map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}
    </div>
  );

  if (!data) return (
    <div className="px-6 py-12 text-center text-sm text-live">加载失败，请刷新</div>
  );

  const totalPick = data.pickDist.win + data.pickDist.draw + data.pickDist.loss;
  const pct = (n: number) => totalPick > 0 ? Math.round(n / totalPick * 100) : 0;
  const dauMax = Math.max(...data.dauTrend.map(d => d.count), 1);
  const regMax = Math.max(...data.regTrend.map(d => d.count), 1);
  const totalUnlocks = Object.values(data.modelDist).reduce((a, b) => a + b, 0);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">

      {/* 页头 */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">数据分析</h1>
          <p className="mt-0.5 text-xs text-faint">
            {new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" })} · 实时数据
          </p>
        </div>
        <button onClick={load}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-mut hover:text-ink transition">
          ↺ 刷新
        </button>
      </div>

      {/* ── 1. 日活 ── */}
      <SectionTitle>日活跃用户</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <MetricCard label="今日活跃" value={data.todayActive}
          accent={data.todayActive > 0 ? "text-neon" : "text-ink"} />
        <MetricCard label="昨日活跃" value={data.yesterdayActive} />
        <MetricCard label="今日签到" value={data.todayCheckins}
          sub="产生行为的用户" />
        <MetricCard label="7日累计 UV"
          value={new Set(data.dauTrend.flatMap(() => [])).size || data.dauTrend.reduce((s, d) => s + d.count, 0)}
          sub="各日去重后求和" />
      </div>
      <div className="card p-4 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">最近 7 天 DAU 趋势</p>
          <p className="text-[10px] text-faint">峰值 {dauMax}</p>
        </div>
        <TrendChart data={data.dauTrend} color="#22c55e" />
      </div>

      {/* ── 2. 用户增长 ── */}
      <SectionTitle>用户增长</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <MetricCard label="注册账号" value={data.emailUsers}
          accent="text-neon" sub="已绑定邮箱" />
        <MetricCard label="历史访客" value={data.guestUsers}
          sub="登录前遗留，无积分" />
        <MetricCard label="7日新增" value={data.regTrend.reduce((s, d) => s + d.count, 0)} />
        <MetricCard label="有效用户" value={data.emailUsers}
          sub="当前活跃账号体系" accent="text-neon" />
      </div>
      <div className="mb-4 rounded-lg border border-line bg-raised/40 px-4 py-2.5 text-xs text-faint">
        ℹ 现已要求登录才能使用积分/竞猜功能。「历史访客」为切换前遗留的设备 ID 记录，无积分、无行为数据，可在「数据管理」中清理。
      </div>
      <div className="card p-4 mb-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">最近 7 天注册趋势</p>
          <p className="text-[10px] text-faint">峰值 {regMax}</p>
        </div>
        <TrendChart data={data.regTrend} color="#6366f1" />
      </div>
      {/* 账号类型比 */}
      <div className="card p-4 mb-6">
        <p className="mb-3 text-xs font-semibold text-ink">账号类型分布</p>
        <div className="flex gap-3 mb-2 text-xs text-mut">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-neon" />邮箱账号
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-raised border border-line" />游客
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden bg-raised flex">
          {data.emailUsers + data.guestUsers > 0 && (
            <div className="bg-neon h-full transition-all"
              style={{ width: `${Math.round(data.emailUsers / (data.emailUsers + data.guestUsers) * 100)}%` }} />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-faint">
          <span>邮箱 {data.emailUsers > 0 ? Math.round(data.emailUsers / (data.emailUsers + data.guestUsers) * 100) : 0}%</span>
          <span>游客 {data.guestUsers > 0 ? Math.round(data.guestUsers / (data.emailUsers + data.guestUsers) * 100) : 0}%</span>
        </div>
      </div>

      {/* ── 3. 竞猜分析 ── */}
      <SectionTitle>竞猜分析</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <MetricCard label="总竞猜次数" value={data.totalPreds} />
        <MetricCard label="已结算" value={data.settledCount}
          sub={`未结算 ${data.totalPreds - data.settledCount}`} />
        <MetricCard label="猜中次数" value={data.wonCount}
          accent="text-neon" />
        <MetricCard label="胜率" value={`${data.winRate}%`}
          accent={data.winRate >= 50 ? "text-neon" : data.winRate >= 33 ? "text-amber" : "text-live"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* 投注偏好 */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold text-ink">投注偏好分布</p>
          {totalPick === 0 ? (
            <p className="text-xs text-faint py-3 text-center">暂无数据</p>
          ) : (
            <div className="space-y-2.5">
              {([["win", "主队胜", "bg-neon"], ["draw", "平局", "bg-amber"], ["loss", "客队胜", "bg-live"]] as const).map(
                ([key, label, color]) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-mut">{label}</span>
                      <span className="font-num text-ink">{pct(data.pickDist[key])}%
                        <span className="text-faint ml-1">({data.pickDist[key]})</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-raised overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all duration-500`}
                        style={{ width: `${pct(data.pickDist[key])}%` }} />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* 热门竞猜比赛 */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold text-ink">热门竞猜比赛 TOP5</p>
          {data.topPredMatches.length === 0 ? (
            <p className="text-xs text-faint py-3 text-center">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {data.topPredMatches.map((m, i) => (
                <div key={m.match_id} className="flex items-center gap-2">
                  <span className="font-num w-4 text-[10px] text-faint">{i + 1}</span>
                  <div className="flex-1">
                    <MiniBar value={m.count}
                      max={data.topPredMatches[0].count}
                      color="bg-neon/60" />
                  </div>
                  <span className="text-[10px] text-faint w-16 truncate text-right">#{m.match_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. 积分流水 ── */}
      <SectionTitle>积分流水</SectionTitle>
      <div className="card p-4 mb-6">
        {Object.keys(data.ledgerByReason).length === 0 ? (
          <p className="text-xs text-faint py-3 text-center">暂无数据</p>
        ) : (
          <div className="divide-y divide-line">
            <div className="grid grid-cols-4 pb-2 text-[10px] font-semibold text-faint">
              <span>来源</span>
              <span className="text-right">次数</span>
              <span className="text-right text-neon">流入积分</span>
              <span className="text-right text-live">流出积分</span>
            </div>
            {Object.entries(data.ledgerByReason).map(([reason, s]) => (
              <div key={reason} className="grid grid-cols-4 py-2.5 text-xs">
                <span className="text-ink">{REASON_LABEL[reason] ?? reason}</span>
                <span className="font-num text-right text-mut">{s.count}</span>
                <span className="font-num text-right text-neon">
                  {s.totalIn > 0 ? `+${s.totalIn.toLocaleString()}` : "—"}
                </span>
                <span className="font-num text-right text-live">
                  {s.totalOut > 0 ? `-${s.totalOut.toLocaleString()}` : "—"}
                </span>
              </div>
            ))}
            {/* 合计 */}
            <div className="grid grid-cols-4 pt-2.5 text-xs font-semibold">
              <span className="text-ink">合计</span>
              <span className="font-num text-right text-mut">
                {Object.values(data.ledgerByReason).reduce((s, r) => s + r.count, 0)}
              </span>
              <span className="font-num text-right text-neon">
                +{Object.values(data.ledgerByReason).reduce((s, r) => s + r.totalIn, 0).toLocaleString()}
              </span>
              <span className="font-num text-right text-live">
                -{Object.values(data.ledgerByReason).reduce((s, r) => s + r.totalOut, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. AI 模型 & 报告 ── */}
      <SectionTitle>AI 模型 & 推演解锁</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <MetricCard label="AI 报告总数" value={data.reportCount}
          accent="text-neon" sub="已生成" />
        <MetricCard label="推演解锁总次" value={totalUnlocks}
          sub="用户付费解锁" />
        <MetricCard label="覆盖比赛数" value={data.topUnlockMatches.length}
          sub="有解锁的场次" />
        <MetricCard label="模型种类" value={Object.keys(data.modelDist).length} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* 模型分布 */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold text-ink">各模型解锁分布</p>
          {totalUnlocks === 0 ? (
            <p className="text-xs text-faint py-3 text-center">暂无解锁记录</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(data.modelDist).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
                <div key={model}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-mut">{MODEL_LABEL[model] ?? model}</span>
                    <span className="font-num text-ink">{count}
                      <span className="text-faint ml-1">({Math.round(count / totalUnlocks * 100)}%)</span>
                    </span>
                  </div>
                  <MiniBar value={count} max={Math.max(...Object.values(data.modelDist))}
                    color="bg-amber/70" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 热门解锁比赛 */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold text-ink">热门解锁比赛 TOP5</p>
          {data.topUnlockMatches.length === 0 ? (
            <p className="text-xs text-faint py-3 text-center">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {data.topUnlockMatches.map((m, i) => (
                <div key={m.match_id} className="flex items-center gap-2">
                  <span className="font-num w-4 text-[10px] text-faint">{i + 1}</span>
                  <div className="flex-1">
                    <MiniBar value={m.count}
                      max={data.topUnlockMatches[0].count}
                      color="bg-amber/60" />
                  </div>
                  <span className="text-[10px] text-faint">#{m.match_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 近期解锁记录 */}
      {data.recentUnlocks.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="border-b border-line px-4 py-3">
            <p className="text-xs font-semibold text-ink">近期解锁记录</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-raised border-b border-line">
              <tr className="text-left text-[10px] text-faint">
                <th className="px-4 py-2 font-normal">比赛 ID</th>
                <th className="px-2 py-2 font-normal">模型</th>
                <th className="px-2 py-2 font-normal">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.recentUnlocks.map((u, i) => (
                <tr key={i} className="hover:bg-raised/30">
                  <td className="font-num px-4 py-2 text-ink">#{u.match_id}</td>
                  <td className="px-2 py-2">
                    <span className={`chip !text-[9px] ${u.model_id === "max" ? "!text-amber" : "!text-neon"}`}>
                      {(MODEL_LABEL[u.model_id] ?? u.model_id).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-faint">{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense><AnalyticsPanel /></Suspense>;
}
