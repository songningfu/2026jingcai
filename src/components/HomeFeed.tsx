"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchLoginState } from "@/lib/account-status";
import TeamFlag from "@/components/TeamFlag";
import LoginModal from "@/app/account/LoginModal";

interface ShowcaseItem {
  home: string;
  away: string;
  label: "比分命中" | "胜负命中";
  result: string;
}

interface MatchFeed {
  id: number;
  kickoff_at: string;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  group_name: string | null;
  home: string;
  away: string;
  seed: { win: number; draw: number; loss: number };
  winVotes: number;
  lossVotes: number;
  modelHit: "score" | "result" | "totalgoals" | "miss" | null;
  day: "today" | "prediction" | "yesterday";
}


const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/* ---- 弹幕 ---- */
function DanmakuBar({ items }: { items: string[] }) {
  const [queue, setQueue] = useState<{ id: number; text: string; top: number; speed: number }[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (items.length === 0) return;
    const pool = [...items, ...items];
    const fire = () => {
      const text = pool[counter.current % pool.length];
      counter.current++;
      setQueue((q) => [
        ...q.slice(-20),
        { id: counter.current, text, top: Math.floor(Math.random() * 55) + 8, speed: Math.floor(Math.random() * 8) + 10 },
      ]);
    };
    fire();
    const t = setInterval(fire, 2000);
    return () => clearInterval(t);
  }, [items]);

  return (
    <div className="relative h-20 overflow-hidden rounded-xl border border-line bg-raised/60 select-none">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-widest text-faint/50">LIVE</span>
      {queue.map((d) => (
        <span
          key={d.id}
          className="absolute whitespace-nowrap rounded-full bg-surface/90 px-3 py-0.5 text-xs text-mut shadow-sm"
          style={{ top: `${d.top}%`, right: "-100%", animation: `danmaku-scroll ${d.speed}s linear forwards` }}
        >
          {d.text}
        </span>
      ))}
    </div>
  );
}

/* ---- 支持率投票（真实服务器票数） ---- */
function SupportVote({ matchId, initWin, initLoss, home, away }: {
  matchId: number; initWin: number; initLoss: number; home: string; away: string;
}) {
  const storageKey = `sv_${matchId}`;
  const [voted, setVoted] = useState<"win" | "loss" | null>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(storageKey) as "win" | "loss" | null);
  });
  const [win, setWin] = useState(initWin);
  const [loss, setLoss] = useState(initLoss);

  const total = win + loss || 1;
  const winPct = Math.round((win / total) * 100);
  const lossPct = 100 - winPct;

  const vote = async (pick: "win" | "loss") => {
    if (voted) return;
    setVoted(pick);
    localStorage.setItem(storageKey, pick);
    if (pick === "win") setWin((w) => w + 1);
    else setLoss((l) => l + 1);

    const deviceId = (await import("@/lib/device-id")).getDeviceId();
    fetch("/api/home/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, deviceId, pick }),
    }).then((r) => r.json()).then((d) => {
      if (d.ok) { setWin(d.winVotes); setLoss(d.lossVotes); }
    }).catch(() => {});
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="bg-neon transition-all duration-500" style={{ width: `${winPct}%` }} />
        <div className="bg-amber/80 transition-all duration-500" style={{ width: `${lossPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-semibold">
        <span className="text-neon">{home} {winPct}%</span>
        <span className="text-amber">{away} {lossPct}%</span>
      </div>
      {!voted ? (
        <div className="flex gap-2">
          {(["win", "loss"] as const).map((pick) => (
            <button
              key={pick}
              onClick={(e) => { e.preventDefault(); vote(pick); }}
              className="flex-1 rounded-xl border border-line bg-raised py-2.5 text-center text-xs font-semibold text-mut transition hover:border-neon/40 hover:text-neon active:scale-95 active:bg-neon/5"
            >
              支持 {pick === "win" ? home : away}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-neon font-semibold py-1">已支持 ✓</p>
      )}
    </div>
  );
}

/* ---- 比赛卡 ---- */
function MatchCard({ m }: { m: MatchFeed }) {
  const finished = m.day === "yesterday";

  return (
    <Link href={`/match/${m.id}`} className="card block p-4 transition hover:border-neon/30">
      <div className="mb-2 flex items-center justify-between text-[10px] text-faint">
        <span>{m.group_name ? `${m.group_name}组` : "世界杯"}</span>
        <span className="font-num">{timeFmt.format(new Date(m.kickoff_at))}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <span className="text-right text-sm font-semibold text-ink">{m.home}</span>
          <TeamFlag name={m.home} size={22} />
        </div>
        <div className="font-num flex min-w-[52px] items-center justify-center gap-0.5 text-xl font-bold tabular-nums">
          {finished ? (
            <>
              <span className="text-ink">{m.home_score}</span>
              <span className="text-faint text-base">:</span>
              <span className="text-ink">{m.away_score}</span>
            </>
          ) : (
            <span className="text-xs text-neon">即将</span>
          )}
        </div>
        <div className="flex flex-1 items-center gap-1.5">
          <TeamFlag name={m.away} size={22} />
          <span className="text-left text-sm font-semibold text-ink">{m.away}</span>
        </div>
      </div>
      {!finished && <SupportVote matchId={m.id} initWin={m.winVotes} initLoss={m.lossVotes} home={m.home} away={m.away} />}
    </Link>
  );
}

/* ---- 我们的预测（展示昨天已完赛 + 真实比分） ---- */
function PredictionSection({ matches, showcase, isLoggedIn, onLoginClick }: {
  matches: MatchFeed[];
  showcase: ShowcaseItem[];
  isLoggedIn: boolean;
  onLoginClick: () => void;
}) {
  // 只展示模型真实命中的卡片（比分 / 胜负 / 总进球数）；未命中或无报告的不展示，
  // 不依赖任何个人数据——所有用户看到的完全一致。
  const visible = matches.filter(
    (m) => m.modelHit === "score" || m.modelHit === "result" || m.modelHit === "totalgoals",
  );
  if (visible.length === 0 && showcase.length === 0) return null;

  // 未登录：用 showcase 数据展示，没有 showcase 时降级用真实数据占位
  const previewItems = showcase.length > 0 ? showcase : [];
  const showPreview = previewItems.length > 0 || visible.length > 0;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" />
          模型推演预测
        </h2>
        {isLoggedIn && (
          <span className="flex items-center gap-1 rounded-full bg-neon/10 px-3 py-1 text-xs font-bold text-neon">
            ✓ 全部命中
          </span>
        )}
      </div>

      {!isLoggedIn && showPreview ? (
        <div className="relative overflow-hidden rounded-2xl border border-line">
          {/* 模糊遮罩预览：显示 admin 配置的 showcase 卡片 */}
          <div className="pointer-events-none grid gap-3 p-4 sm:grid-cols-2 blur-sm select-none">
            {(previewItems.length > 0 ? previewItems : visible.slice(0, 2)).slice(0, 4).map((item, idx) => {
              const isShowcase = previewItems.length > 0;
              const s = item as ShowcaseItem;
              const m = item as MatchFeed;
              return (
                <div key={idx} className="card overflow-hidden">
                  <div className="h-1 w-full bg-gradient-to-r from-neon via-neon/60 to-amber/40" />
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between text-[10px] text-faint">
                      <span>世界杯</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${
                        isShowcase && s.label === "比分命中"
                          ? "bg-amber/10 text-amber"
                          : "bg-neon/10 text-neon"
                      }`}>
                        {isShowcase ? s.label : "预测命中"} ✓
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 text-right text-sm font-bold text-ink">
                        {isShowcase ? s.home : m.home}
                      </span>
                      <span className="font-num min-w-[52px] text-center text-xl font-bold text-neon">
                        {isShowcase ? s.result : "? : ?"}
                      </span>
                      <span className="flex-1 text-left text-sm font-bold text-ink">
                        {isShowcase ? s.away : m.away}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* 登录提示遮罩 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/80 backdrop-blur-[2px]">
            <p className="text-sm font-medium text-ink">登录后查看模型推演预测结果</p>
            <button
              onClick={onLoginClick}
              className="rounded-xl bg-neon px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              登录
            </button>
          </div>
        </div>
      ) : !isLoggedIn ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((m) => {
            // 展示维度由「真实命中类型」决定，所有用户一致
            const kind = m.modelHit; // "score" | "result" | "totalgoals"
            const hs = m.home_score ?? 0;
            const as = m.away_score ?? 0;
            const result = hs > as ? "home" : hs < as ? "away" : "draw";
            const totalGoals = hs + as;
            // 中间区域：比分命中→显示比分；胜负命中→显示胜负；总进球命中→显示总进球
            const showScore = kind === "score";
            const showTotal = kind === "totalgoals";
            const highlightNames = kind === "result";
            const homeNameCls =
              highlightNames && result === "home"
                ? "text-neon"
                : highlightNames && result === "away"
                  ? "text-faint"
                  : "text-ink";
            const awayNameCls =
              highlightNames && result === "away"
                ? "text-neon"
                : highlightNames && result === "home"
                  ? "text-faint"
                  : "text-ink";
            const badge =
              kind === "score"
                ? { cls: "bg-amber/10 text-amber", text: "比分命中 ✓" }
                : kind === "totalgoals"
                  ? { cls: "bg-neon/10 text-neon", text: "总进球命中 ✓" }
                  : { cls: "bg-neon/10 text-neon", text: "胜负命中 ✓" };
            return (
              <Link key={m.id} href={`/match/${m.id}`}
                className="card block overflow-hidden transition hover:border-neon/40 hover:shadow-[0_0_16px_rgba(0,200,100,0.12)] hover:-translate-y-0.5">
                <div className="h-1 w-full bg-gradient-to-r from-neon via-neon/60 to-amber/40" />
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] text-faint">
                    <span>{m.group_name ? `${m.group_name}组` : "世界杯"}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 items-center justify-end gap-1.5">
                      <span className={`text-right text-sm font-bold ${homeNameCls}`}>{m.home}</span>
                      <TeamFlag name={m.home} size={22} />
                    </div>
                    {showScore ? (
                      <div className="font-num flex min-w-[52px] items-center justify-center gap-0.5 text-2xl font-bold text-neon tabular-nums">
                        <span>{m.home_score}</span>
                        <span className="text-faint text-lg">:</span>
                        <span>{m.away_score}</span>
                      </div>
                    ) : showTotal ? (
                      <div className="flex min-w-[52px] items-center justify-center">
                        <span className="font-num whitespace-nowrap rounded-full border border-neon/30 bg-neon/10 px-3 py-1 text-[11px] font-bold text-neon tabular-nums">
                          总进球 {totalGoals >= 7 ? "7+" : totalGoals}
                        </span>
                      </div>
                    ) : (
                      <div className="flex min-w-[52px] items-center justify-center">
                        {result === "draw" ? (
                          <span className="whitespace-nowrap rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-[11px] font-bold text-amber">
                            平局
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full border border-neon/30 bg-neon/10 px-3 py-1 text-[11px] font-bold text-neon">
                            {result === "home" ? `${m.home}胜` : `${m.away}胜`}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-1 items-center gap-1.5">
                      <TeamFlag name={m.away} size={22} />
                      <span className={`text-left text-sm font-bold ${awayNameCls}`}>{m.away}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-xs text-faint">
                    {timeFmt.format(new Date(m.kickoff_at))} · 点击查看完整推演
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---- 主组件 ---- */
export default function HomeFeed() {
  const [feed, setFeed] = useState<MatchFeed[]>([]);
  const [danmaku, setDanmaku] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showcase, setShowcase] = useState<ShowcaseItem[]>([]);
  // matchId → won，仅包含已结算的竞猜记录
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    fetchLoginState().then(setIsLoggedIn);
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/home/feed")
        .then((r) => r.json())
        .then((d) => { if (d.ok) { setFeed(d.feed); setDanmaku(d.danmaku ?? []); if (d.showcase) setShowcase(d.showcase); } })
        .finally(() => setLoading(false));

    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const today = feed.filter((m) => m.day === "today");
  const predictions = feed.filter((m) => m.day === "prediction");
  const yesterday = feed.filter((m) => m.day === "yesterday");

  if (loading || feed.length === 0) return null;

  return (
    <div className="mt-8 space-y-8">
      {/* 我们的预测（上一天已完赛） */}
      <PredictionSection
        matches={predictions}
        showcase={showcase}
        isLoggedIn={isLoggedIn}
        onLoginClick={() => setShowLogin(true)}
      />
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => { setIsLoggedIn(true); setShowLogin(false); }}
        />
      )}

      {/* 今日比赛 */}
      {today.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-mut">
            <span className="h-2 w-2 rounded-full bg-neon" />
            今日比赛
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {today.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        </section>
      )}

      {/* 前天赛果 */}
      {yesterday.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-mut">更多赛果</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {yesterday.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}
