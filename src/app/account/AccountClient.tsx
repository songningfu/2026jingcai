"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getDeviceId } from "@/lib/device-id";
import { checkinBonus } from "@/lib/subscriptions";
import LoginModal from "./LoginModal";

type SubTier = "free" | "pro" | "max";

interface AccountView {
  id: string;
  nickname: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  points: number;
  tier: SubTier;
  subType: string | null;
  subExpires: string | null;
  unlocks: { match_id: number; model_id: string | null; created_at: string }[];
  predictions: {
    match_id: number;
    pick: string;
    points_staked: number;
    settled: boolean;
    won: boolean | null;
    points_delta: number | null;
  }[];
}

interface GameProfile {
  nickname: string | null;
  points: number;
  last_checkin: string | null;
  invite_code: string | null;
  invited_by: string | null;
}

const TIER_META: Record<SubTier, { name: string; badge: string; cls: string }> = {
  free: { name: "免费", badge: "FREE", cls: "bg-raised text-mut" },
  pro: { name: "Pro", badge: "PRO", cls: "bg-neon/10 text-neon" },
  max: { name: "Max", badge: "MAX", cls: "bg-amber/10 text-amber" },
};
const PICK_LABEL: Record<string, string> = { win: "主胜", draw: "平局", loss: "客胜" };
const INVITE_BONUS_INVITER = 200;

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

function todayCN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export default function AccountClient() {
  const [deviceId, setDeviceId] = useState("");
  const [acc, setAcc] = useState<AccountView | null>(null);
  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activationCode, setActivationCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const loadGame = useCallback(async (id: string, nickname?: string) => {
    const res = await fetch("/api/games/me", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // register=false：账户页只读，不给新设备自动建档
      body: JSON.stringify({ deviceId: id, nickname, register: nickname !== undefined }),
    });
    const data = await res.json();
    if (data.ok) {
      setGameProfile(data.profile);
      setRank(data.rank);
      setInviteCount(data.inviteCount ?? 0);
    }
  }, []);

  const loadAccount = useCallback(async (id: string) => {
    const res = await fetch("/api/account/me", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    });
    const data = await res.json();
    if (data.ok) {
      setAcc(data.account);
      // 登录态以服务端账号数据为准（profile 已绑定用户名/邮箱即为账号），
      // 不依赖浏览器 Supabase session——国内直连 Supabase 常失败，会误判为未登录
      setIsLoggedIn(!!(data.account?.username || data.account?.email));
    }
  }, []);

  useEffect(() => {
    // 只有 localStorage 里已有 deviceId（老访客）才加载数据
    // 全新访客不自动建档，避免留下无意义的匿名记录
    const existingId = typeof window !== "undefined"
      ? localStorage.getItem("qiuyi_device_id")
      : null;

    if (existingId) {
      const id = getDeviceId(); // 返回已有的，不新建
      setDeviceId(id);
      Promise.all([loadAccount(id), loadGame(id)]).finally(() => setLoading(false));
    } else {
      setLoading(false); // 全新设备：直接结束 loading，不查 DB
    }
  }, [loadAccount, loadGame]);

  const refresh = useCallback(() => {
    const id = getDeviceId();
    setDeviceId(id);
    loadAccount(id);
    loadGame(id);
  }, [loadAccount, loadGame]);

  const editNickname = async () => {
    const next = prompt("设置昵称（最多 16 字）", gameProfile?.nickname ?? acc?.nickname ?? "");
    if (next && next.trim()) {
      await fetch("/api/games/me", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, nickname: next.trim() }),
      });
      loadGame(deviceId);
      loadAccount(deviceId);
      flash("昵称已更新");
    }
  };

  const logout = async () => {
    const { supabaseBrowser } = await import("@/lib/supabase-browser");
    const { resetDeviceId } = await import("@/lib/device-id");
    // signOut 会请求 Supabase，国内可能挂起——后台尽力而为，不阻塞本地登出
    void supabaseBrowser().auth.signOut().catch(() => {});
    resetDeviceId();
    // 清空所有状态，不再触发 loadGame/loadAccount（新 ID 不应自动建档）
    setIsLoggedIn(false);
    setAcc(null);
    setGameProfile(null);
    setRank(null);
    setInviteCount(0);
    setDeviceId("");
  };

  const doCheckin = async () => {
    setCheckinBusy(true);
    const res = await fetch("/api/games/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    setCheckinBusy(false);
    flash(data.message);
    if (data.ok) loadGame(deviceId);
  };

  const copyInviteLink = () => {
    const ic = gameProfile?.invite_code;
    if (!ic) return;
    const url = `${window.location.origin}/games?ref=${ic}`;
    navigator.clipboard.writeText(url)
      .then(() => flash("邀请链接已复制！"))
      .catch(() => flash(`邀请码 ${ic}`));
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    const form = new FormData();
    form.append("deviceId", deviceId);
    form.append("file", file);
    const res = await fetch("/api/account/avatar", { method: "POST", body: form });
    const data = await res.json();
    setAvatarBusy(false);
    if (data.ok) {
      flash("头像已更新");
      loadAccount(deviceId);
    } else {
      flash(data.error ?? "上传失败");
    }
    e.target.value = "";
  };

  const redeem = async () => {
    if (!activationCode.trim()) return;
    setRedeemBusy(true);
    setRedeemMsg("");
    const res = await fetch("/api/account/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, code: activationCode.trim() }),
    });
    const data = await res.json();
    setRedeemMsg(data.message ?? (data.ok ? "激活成功" : "兑换失败"));
    setRedeemBusy(false);
    if (data.ok) { setActivationCode(""); loadAccount(deviceId); }
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-mut">载入中…</div>;
  }

  const nickname = gameProfile?.nickname ?? acc?.nickname ?? "球迷";
  const points = gameProfile?.points ?? acc?.points ?? 0;
  const checkedInToday = gameProfile?.last_checkin === todayCN();
  const tier = acc?.tier ?? "free";
  const tm = TIER_META[tier];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">我的账户</h1>

      {/* ── 资料卡 ── */}
      <div className="card relative mt-5 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/50 to-transparent" />

        {/* 顶部：头像区 + 积分 */}
        <div className="flex items-center gap-4 px-5 pt-5">
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neon/10 overflow-hidden group"
            title="点击更换头像"
          >
            {acc?.avatar_url ? (
              <Image src={acc.avatar_url} alt="头像" fill className="object-cover" unoptimized />
            ) : (
              <span className="text-xl font-bold text-neon">{nickname[0]?.toUpperCase() ?? "球"}</span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-medium">
              {avatarBusy ? "…" : "换头像"}
            </div>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
          <div className="flex-1 min-w-0">
            <button onClick={editNickname} className="flex items-center gap-1 text-base font-bold text-ink hover:text-neon">
              {nickname} <span className="text-xs text-faint">✎</span>
            </button>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tm.cls}`}>{tm.badge}</span>
              {tier !== "free" && acc?.subExpires && (
                <span>至 {dateFmt.format(new Date(acc.subExpires))}</span>
              )}
              <span>·</span>
              {isLoggedIn
                ? <span className="text-neon">账号已绑定</span>
                : <button onClick={() => setShowLogin(true)} className="text-amber hover:underline">设备访客 · 点击登录</button>
              }
            </div>
          </div>
          <div className="shrink-0 text-right">
            {isLoggedIn ? (
              <>
                <div className="font-num text-3xl font-bold tabular-nums text-neon leading-none">{points}</div>
                <div className="mt-0.5 text-xs text-faint">积分</div>
              </>
            ) : (
              <button onClick={() => setShowLogin(true)} className="text-right">
                <div className="font-num text-2xl font-bold tabular-nums text-faint leading-none">—</div>
                <div className="mt-0.5 text-[11px] text-amber hover:underline">登录查看</div>
              </button>
            )}
          </div>
        </div>

        {/* 分隔线 + 状态行 */}
        <div className="mx-5 mt-4 border-t border-line pt-3">
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-mut">
            {rank && <span>排名 <span className="font-num font-semibold text-ink">#{rank}</span></span>}
            <span>·</span>
            <span>
              订阅：
              {tier === "free"
                ? <span className="text-faint">免费版</span>
                : <span className="font-medium text-neon">{tm.name} 会员</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tier === "free" && (
              <Link href="/pricing" className="rounded-lg border border-line px-2.5 py-1 text-xs text-mut transition hover:border-neon/50 hover:text-neon">
                升级
              </Link>
            )}
            {isLoggedIn && (
              <button onClick={logout}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-faint transition hover:border-live/40 hover:text-live">
                退出
              </button>
            )}
          </div>
          </div>
          {/* 用户 ID */}
          <button
            onClick={() => { navigator.clipboard.writeText(acc?.id ?? deviceId); flash("ID 已复制"); }}
            className="mt-1.5 text-[10px] text-faint/60 hover:text-faint transition-colors"
            title="点击复制完整 ID"
          >
            ID: {(acc?.id ?? deviceId).slice(0, 16)}…
          </button>
        </div>

        {/* 签到 / 登录 CTA */}
        <div className="px-5 pb-5 pt-3">
          {isLoggedIn ? (
            <button onClick={doCheckin} disabled={checkedInToday || checkinBusy}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                checkedInToday ? "bg-raised text-faint" : "bg-neon text-white hover:brightness-110"
              }`}>
              {checkedInToday ? "今日已签到 ✓" : checkinBusy ? "签到中…" : `每日签到 +${checkinBonus(acc?.tier ?? "free")} 积分`}
            </button>
          ) : (
            <button onClick={() => setShowLogin(true)}
              className="w-full rounded-xl border border-amber/40 bg-amber/5 py-2.5 text-sm font-semibold text-amber transition hover:bg-amber/10">
              登录后签到领积分
            </button>
          )}
          {!isLoggedIn && (
            <button onClick={() => setShowLogin(true)}
              className="mt-2 w-full rounded-xl border border-line py-2 text-sm text-mut transition hover:border-neon/50 hover:text-neon">
              登录账号 — 积分跨设备同步
            </button>
          )}
        </div>
      </div>

      {/* ── 激活码 ── */}
      <div className="card mt-4 p-5">
        <h2 className="text-sm font-semibold text-ink">激活码</h2>
        <p className="mt-0.5 text-xs text-faint">输入激活码兑换 Pro / Max 会员权益</p>
        {isLoggedIn ? (
          <>
            <div className="mt-3 flex gap-2">
              <input
                value={activationCode}
                onChange={e => setActivationCode(e.target.value)}
                placeholder="输入激活码"
                className="flex-1 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm uppercase text-ink focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/10"
              />
              <button onClick={redeem} disabled={redeemBusy || !activationCode.trim()}
                className="shrink-0 rounded-xl bg-neon px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:bg-raised disabled:text-faint">
                {redeemBusy ? "激活中…" : "激活"}
              </button>
            </div>
            {redeemMsg && <p className="mt-2 text-xs text-amber/90">{redeemMsg}</p>}
          </>
        ) : (
          <button onClick={() => setShowLogin(true)}
            className="mt-3 w-full rounded-xl border border-amber/30 bg-amber/5 py-2.5 text-sm text-amber transition hover:bg-amber/10">
            登录后使用激活码
          </button>
        )}
      </div>

      {/* ── 邀请 ── */}
      <div className="card mt-4 p-5">
        <h2 className="text-sm font-semibold text-ink">邀请好友</h2>
        <p className="mt-0.5 text-xs text-faint">好友使用你的邀请码注册，双方各得积分奖励</p>
        {isLoggedIn ? (
          <>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-raised px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-faint">我的邀请码</div>
                <div className="font-num mt-0.5 text-lg font-bold tracking-widest text-ink">
                  {gameProfile?.invite_code ?? "——"}
                </div>
              </div>
              <button onClick={copyInviteLink}
                className="shrink-0 rounded-lg bg-neon/10 px-4 py-2 text-xs font-semibold text-neon transition hover:bg-neon/20">
                复制链接
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-raised px-3 py-3 text-center">
                <div className="font-num text-xl font-bold text-ink">{inviteCount}</div>
                <div className="mt-0.5 text-[11px] text-faint">已邀请人数</div>
              </div>
              <div className="rounded-xl bg-raised px-3 py-3 text-center">
                <div className="font-num text-xl font-bold text-neon">+{inviteCount * INVITE_BONUS_INVITER}</div>
                <div className="mt-0.5 text-[11px] text-faint">累计获得积分</div>
              </div>
              <div className="rounded-xl bg-raised px-3 py-3 text-center">
                <div className="font-num text-xl font-bold text-ink">{INVITE_BONUS_INVITER}</div>
                <div className="mt-0.5 text-[11px] text-faint">每邀一人奖励</div>
              </div>
            </div>
          </>
        ) : (
          <button onClick={() => setShowLogin(true)}
            className="mt-3 w-full rounded-xl border border-line py-2.5 text-sm text-mut transition hover:border-neon/40 hover:text-neon">
            登录后查看邀请码
          </button>
        )}
      </div>

      {/* ── 竞猜记录 ── */}
      <div className="card mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
          竞猜记录 <span className="text-xs font-normal text-faint">({acc?.predictions.length ?? 0})</span>
        </h2>
        {!acc?.predictions.length ? (
          <p className="px-5 py-8 text-center text-sm text-mut">还没有竞猜记录。</p>
        ) : (
          acc.predictions.slice(0, 20).map((p, i) => (
            <div key={i} className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0">
              <span className="text-ink">
                比赛 #{p.match_id} · 猜{PICK_LABEL[p.pick] ?? p.pick} · {p.points_staked} 积分
              </span>
              {!p.settled ? (
                <span className="chip">待结算</span>
              ) : p.won ? (
                <span className="font-num font-semibold text-neon">+{p.points_delta}</span>
              ) : (
                <span className="font-num font-semibold text-live">{p.points_delta}</span>
              )}
            </div>
          ))
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        积分纯虚拟，不可充值、不可提现、不可兑换现金等价物；订阅为分析工具使用权益。
        所有内容仅供参考，不构成购彩建议，理性娱乐，未满 18 周岁禁止购彩。
      </p>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onAuthChange={refresh} />}

      {toast && (
        <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <div className="rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
