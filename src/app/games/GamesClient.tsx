"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDeviceId } from "@/lib/device-id";

export interface GameMatch {
  id: number;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoff: string;
  group: string | null;
  mult: { win: number; draw: number; loss: number };
}

type Pick = "win" | "draw" | "loss";
const PICK_LABEL: Record<Pick, string> = { win: "主胜", draw: "平局", loss: "客胜" };

interface Profile {
  id: string;
  nickname: string | null;
  points: number;
  last_checkin: string | null;
}
interface PredictionView {
  id: number;
  match_id: number;
  pick: Pick;
  points_staked: number;
  payout_multiplier: number;
  settled: boolean;
  won: boolean | null;
  points_delta: number | null;
}

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function todayCN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

type Tab = "predict" | "rank" | "mine";

export default function GamesClient({ matches }: { matches: GameMatch[] }) {
  const [deviceId, setDeviceId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [predictions, setPredictions] = useState<PredictionView[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("predict");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const predictedIds = useMemo(
    () => new Set(predictions.map((p) => p.match_id)),
    [predictions],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const refresh = useCallback(async (id: string, nickname?: string) => {
    const res = await fetch("/api/games/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id, nickname }),
    });
    const data = await res.json();
    if (data.ok) {
      setProfile(data.profile);
      setPredictions(data.predictions);
      setRank(data.rank);
    }
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    refresh(id).finally(() => setLoading(false));
  }, [refresh]);

  const doCheckin = async () => {
    const res = await fetch("/api/games/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    flash(data.message);
    if (data.ok) refresh(deviceId);
  };

  const editNickname = async () => {
    const next = prompt("设置昵称（最多 16 字）", profile?.nickname ?? "");
    if (next && next.trim()) {
      await refresh(deviceId, next.trim());
      flash("昵称已更新");
    }
  };

  const checkedInToday = profile?.last_checkin === todayCN();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-mut">载入中…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 资料头 */}
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/50 to-transparent" />
        <div className="flex items-center justify-between">
          <div>
            <button onClick={editNickname} className="text-lg font-bold text-ink hover:text-neon">
              {profile?.nickname ?? "球迷"} <span className="text-xs text-faint">✎</span>
            </button>
            <p className="mt-0.5 text-xs text-faint">
              排名 {rank ? `第 ${rank} 名` : "—"} · 设备访客身份
            </p>
          </div>
          <div className="text-right">
            <div className="font-num text-3xl font-bold tabular-nums text-neon">
              {profile?.points ?? 0}
            </div>
            <div className="text-xs text-faint">积分</div>
          </div>
        </div>
        <button
          onClick={doCheckin}
          disabled={checkedInToday}
          className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition ${
            checkedInToday
              ? "bg-raised text-faint"
              : "bg-neon text-white hover:brightness-110"
          }`}
        >
          {checkedInToday ? "今日已签到 ✓" : "每日签到 +100"}
        </button>
      </div>

      {/* tabs */}
      <div className="mt-6 flex gap-2">
        {(
          [
            { k: "predict", label: "竞猜" },
            { k: "rank", label: "排行榜" },
            { k: "mine", label: "我的" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              tab === t.k
                ? "bg-neon font-medium text-white"
                : "bg-surface text-mut ring-1 ring-line hover:ring-neon/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "predict" && (
          <PredictTab
            matches={matches}
            predictedIds={predictedIds}
            points={profile?.points ?? 0}
            deviceId={deviceId}
            onDone={(msg) => {
              flash(msg);
              refresh(deviceId);
            }}
          />
        )}
        {tab === "rank" && <RankTab myNickname={profile?.nickname ?? null} />}
        {tab === "mine" && <MineTab predictions={predictions} matches={matches} />}
      </div>

      <p className="mt-8 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
        积分为虚拟游戏币，<strong>不可充值、不可提现、不可兑换任何现金等价物</strong>，仅用于娱乐排名。
        竞猜结果由真实赛果结算，理性娱乐。
      </p>

      {toast && (
        <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <div className="rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- 竞猜 tab ---------- */

function PredictTab({
  matches,
  predictedIds,
  points,
  deviceId,
  onDone,
}: {
  matches: GameMatch[];
  predictedIds: Set<number>;
  points: number;
  deviceId: string;
  onDone: (msg: string) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="card border-dashed px-4 py-12 text-center text-sm text-mut">
        暂无可竞猜的比赛，开赛前会自动放出。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          already={predictedIds.has(m.id)}
          points={points}
          deviceId={deviceId}
          onDone={onDone}
        />
      ))}
    </div>
  );
}

function MatchCard({
  match,
  already,
  points,
  deviceId,
  onDone,
}: {
  match: GameMatch;
  already: boolean;
  points: number;
  deviceId: string;
  onDone: (msg: string) => void;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);

  const mult = pick ? match.mult[pick] : null;
  const potential = pick ? Math.round(stake * match.mult[pick]) : 0;

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    const res = await fetch("/api/games/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, matchId: match.id, pick, stake }),
    });
    const data = await res.json();
    setBusy(false);
    onDone(data.ok ? `${data.message}，命中可得 ${potential}` : data.error || data.message);
  };

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between text-xs text-faint">
        <span>
          {timeFmt.format(new Date(match.kickoff))}
          {match.group ? ` · ${match.group}组` : ""}
        </span>
        {already && <span className="text-neon">已竞猜 ✓</span>}
      </div>
      <div className="mb-3 flex items-center justify-center gap-3 text-sm font-medium text-ink">
        {match.homeLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.homeLogo} alt="" className="h-5 w-5 object-contain" />
        )}
        {match.home}
        <span className="text-faint">vs</span>
        {match.away}
        {match.awayLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.awayLogo} alt="" className="h-5 w-5 object-contain" />
        )}
      </div>

      {already ? (
        <p className="text-center text-xs text-faint">已对本场竞猜，赛后自动结算</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(["win", "draw", "loss"] as Pick[]).map((p) => (
              <button
                key={p}
                onClick={() => setPick(p)}
                className={`rounded-lg border py-2 text-center transition ${
                  pick === p
                    ? "border-neon bg-neon/10 text-neon"
                    : "border-line bg-raised text-ink hover:border-neon/40"
                }`}
              >
                <div className="text-sm">{PICK_LABEL[p]}</div>
                <div className="font-num text-xs tabular-nums text-amber">
                  {match.mult[p].toFixed(2)}×
                </div>
              </button>
            ))}
          </div>

          {pick && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-mut">
                投入
                <input
                  type="number"
                  min={10}
                  max={points}
                  value={stake}
                  onChange={(e) =>
                    setStake(Math.max(10, Math.min(points, Number(e.target.value) || 10)))
                  }
                  className="font-num w-20 rounded-md border border-line bg-raised px-2 py-1 text-center text-ink focus:border-neon focus:outline-none"
                />
                积分
              </div>
              <div className="ml-auto text-xs text-faint">
                命中得{" "}
                <span className="font-num font-semibold text-neon">{potential}</span>
                （{mult?.toFixed(2)}×）
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!pick || busy || stake > points}
            className="mt-3 w-full rounded-lg bg-neon py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:bg-raised disabled:text-faint"
          >
            {stake > points ? "积分不足" : busy ? "提交中…" : "确认竞猜"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- 排行榜 tab ---------- */

function RankTab({ myNickname }: { myNickname: string | null }) {
  const [rows, setRows] = useState<{ nickname: string | null; points: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games/leaderboard")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-sm text-mut">载入中…</div>;
  if (rows.length === 0)
    return (
      <div className="card border-dashed px-4 py-12 text-center text-sm text-mut">
        还没有人上榜，快去竞猜抢第一名。
      </div>
    );

  return (
    <div className="card overflow-hidden">
      {rows.map((r, i) => {
        const mine = r.nickname === myNickname;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 ${
              mine ? "bg-neon/5" : ""
            }`}
          >
            <span
              className={`font-num w-7 text-center text-lg font-bold tabular-nums ${
                i < 3 ? "text-amber" : "text-faint"
              }`}
            >
              {i + 1}
            </span>
            <span className={`flex-1 text-sm ${mine ? "font-semibold text-neon" : "text-ink"}`}>
              {r.nickname ?? "匿名球迷"}
              {mine && " （我）"}
            </span>
            <span className="font-num font-semibold tabular-nums text-ink">{r.points}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 我的 tab ---------- */

function MineTab({
  predictions,
  matches,
}: {
  predictions: PredictionView[];
  matches: GameMatch[];
}) {
  const nameOf = (id: number) => {
    const m = matches.find((x) => x.id === id);
    return m ? `${m.home} vs ${m.away}` : `比赛 #${id}`;
  };

  if (predictions.length === 0)
    return (
      <div className="card border-dashed px-4 py-12 text-center text-sm text-mut">
        还没有竞猜记录，去「竞猜」选一场吧。
      </div>
    );

  return (
    <div className="card overflow-hidden">
      {predictions.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <div className="flex-1">
            <div className="text-sm text-ink">{nameOf(p.match_id)}</div>
            <div className="text-xs text-faint">
              猜 {PICK_LABEL[p.pick]} · 投入 {p.points_staked} · {Number(p.payout_multiplier).toFixed(2)}×
            </div>
          </div>
          {!p.settled ? (
            <span className="chip">待结算</span>
          ) : p.won ? (
            <span className="font-num font-semibold text-neon">
              猜中 +{p.points_delta}
            </span>
          ) : (
            <span className="font-num font-semibold text-live">{p.points_delta}</span>
          )}
        </div>
      ))}
    </div>
  );
}
