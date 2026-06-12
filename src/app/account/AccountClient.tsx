"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device-id";

type SubTier = "free" | "pro" | "max";

interface AccountView {
  id: string;
  nickname: string | null;
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

const TIER_META: Record<SubTier, { name: string; badge: string; cls: string }> = {
  free: { name: "免费用户", badge: "FREE", cls: "bg-raised text-mut" },
  pro: { name: "Pro 会员", badge: "PRO", cls: "bg-neon/10 text-neon" },
  max: { name: "Max 会员", badge: "MAX", cls: "bg-amber/10 text-amber" },
};
const PICK_LABEL: Record<string, string> = { win: "主胜", draw: "平局", loss: "客胜" };

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default function AccountClient() {
  const [deviceId, setDeviceId] = useState("");
  const [acc, setAcc] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    const res = await fetch("/api/account/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    });
    const data = await res.json();
    if (data.ok) setAcc(data.account);
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    load(id).finally(() => setLoading(false));
  }, [load]);

  const editNickname = async () => {
    const next = prompt("设置昵称（最多 16 字）", acc?.nickname ?? "");
    if (next && next.trim()) {
      await fetch("/api/games/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, nickname: next.trim() }),
      });
      load(deviceId);
    }
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setRedeemBusy(true);
    setRedeemMsg("");
    const res = await fetch("/api/account/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, code: code.trim() }),
    });
    const data = await res.json();
    setRedeemMsg(data.message ?? (data.ok ? "开通成功" : "兑换失败"));
    setRedeemBusy(false);
    if (data.ok) {
      setCode("");
      load(deviceId);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-mut">载入中…</div>;
  }
  if (!acc) {
    return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-mut">账户载入失败，请刷新。</div>;
  }

  const tm = TIER_META[acc.tier];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">我的账户</h1>

      {/* 资料 + 积分 */}
      <div className="card mt-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={editNickname} className="text-lg font-bold text-ink hover:text-neon">
              {acc.nickname ?? "球迷"} <span className="text-xs text-faint">✎</span>
            </button>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-faint">
              <span className={`font-num rounded-full px-2 py-0.5 ${tm.cls}`}>{tm.badge}</span>
              设备访客身份
            </p>
          </div>
          <div className="text-right">
            <div className="font-num text-3xl font-bold tabular-nums text-neon">{acc.points}</div>
            <div className="text-xs text-faint">积分</div>
          </div>
        </div>
      </div>

      {/* 订阅状态 */}
      <div className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">订阅状态</h2>
            <p className="mt-1 text-sm text-mut">
              {acc.tier === "free"
                ? "当前为免费用户"
                : `${tm.name} · 有效期至 ${acc.subExpires ? dateFmt.format(new Date(acc.subExpires)) : "—"}`}
            </p>
          </div>
          <Link
            href="/pricing"
            className="rounded-lg border border-line-strong px-4 py-2 text-sm text-ink transition hover:border-neon/50 hover:text-neon"
          >
            {acc.tier === "free" ? "升级订阅" : "查看权益"}
          </Link>
        </div>

        {/* 开通码 */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs text-mut">输入开通码激活 Pro / Max（在线支付资质就绪前的手动开通方式）</p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="开通码"
              className="flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink uppercase focus:border-neon focus:outline-none"
            />
            <button
              onClick={redeem}
              disabled={redeemBusy || !code.trim()}
              className="rounded-lg bg-neon px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:bg-raised disabled:text-faint"
            >
              {redeemBusy ? "兑换中…" : "兑换"}
            </button>
          </div>
          {redeemMsg && <p className="mt-2 text-xs text-amber/90">{redeemMsg}</p>}
        </div>
      </div>

      {/* 深度推演记录 */}
      <div className="card mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
          深度推演记录 <span className="text-xs font-normal text-faint">({acc.unlocks.length})</span>
        </h2>
        {acc.unlocks.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-mut">还没有深度推演记录。</p>
        ) : (
          acc.unlocks.slice(0, 20).map((u, i) => (
            <Link
              key={i}
              href={`/match/${u.match_id}`}
              className="flex items-center justify-between border-b border-line px-5 py-3 text-sm transition last:border-0 hover:bg-raised/60"
            >
              <span className="text-ink">比赛 #{u.match_id}</span>
              <span className="text-xs text-faint">
                {u.model_id ?? "—"} · {dateFmt.format(new Date(u.created_at))}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* 竞猜记录 */}
      <div className="card mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
          竞猜记录 <span className="text-xs font-normal text-faint">({acc.predictions.length})</span>
        </h2>
        {acc.predictions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-mut">还没有竞猜记录。</p>
        ) : (
          acc.predictions.slice(0, 20).map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0"
            >
              <span className="text-ink">
                比赛 #{p.match_id} · 猜{PICK_LABEL[p.pick] ?? p.pick} · {p.points_staked}积分
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
    </div>
  );
}
