"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { SUB_PLANS, activeTier, type SubTier } from "@/lib/subscriptions";
import LoginModal from "@/app/account/LoginModal";

const ORDER = ["free", "pro", "max"] as const;

export default function PricingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userTier, setUserTier] = useState<SubTier | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("qiuyi_device_id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    fetch("/api/account/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && (data.account?.username || data.account?.email)) {
          setIsLoggedIn(true);
          setUserTier(activeTier(data.account?.sub_type, data.account?.sub_expires));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="text-center">
        <p className="font-num text-xs font-semibold tracking-[0.3em] text-neon">SUBSCRIPTION</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">选择你的订阅</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mut">
          订阅解锁的是<strong className="text-ink">大模型深度推演的使用权益</strong>——卖的是信息与效率，
          不是预测结果，不构成任何购彩建议。
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {ORDER.map((tier) => {
          const plan = SUB_PLANS[tier];
          const isPro = tier === "pro";
          return (
            <div
              key={tier}
              className={`card relative flex flex-col p-6 ${
                plan.highlight ? "border-neon/50 ring-1 ring-neon/30" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-neon px-3 py-0.5 text-xs font-medium text-white">
                  最受欢迎
                </span>
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                <span
                  className={`font-num rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isPro
                      ? "bg-neon/10 text-neon"
                      : tier === "max"
                        ? "bg-amber/10 text-amber"
                        : "bg-raised text-mut"
                  }`}
                >
                  {plan.badge}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-ink">{plan.priceLabel}</span>
                {tier !== "free" && <span className="ml-1 text-xs text-mut">/ 世界杯全程</span>}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-mut">
                    <span className={`mt-0.5 ${tier === "free" ? "text-faint" : "text-neon"}`}>✓</span>
                    {perk}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {/* 已拥有此档位（仅付费档） */}
                {isLoggedIn && tier !== "free" && userTier === tier ? (
                  <div className="flex items-center justify-center gap-1.5 rounded-lg border border-neon/40 bg-neon/5 py-2.5 text-sm font-semibold text-neon">
                    <span>✓</span>
                    <span>已拥有</span>
                  </div>
                ) : tier === "free" ? (
                  <Link
                    href="/games"
                    className="inline-flex items-center justify-center rounded-lg border border-line-strong px-3 py-2.5 text-sm font-medium text-ink transition hover:border-neon/50 sm:min-h-0 sm:min-w-0"
                  >
                    免费畅玩
                  </Link>
                ) : isLoggedIn ? (
                  <Link
                    href="/buy"
                    className={`inline-flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:min-h-0 sm:min-w-0 ${
                      isPro
                        ? "bg-neon text-white hover:brightness-110"
                        : "bg-amber text-white hover:brightness-110"
                    }`}
                  >
                    立即开通
                  </Link>
                ) : (
                  <button
                    onClick={() => setShowLogin(true)}
                    className={`inline-flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:min-h-0 sm:min-w-0 ${
                      isPro
                        ? "bg-neon text-white hover:brightness-110"
                        : "bg-amber text-white hover:brightness-110"
                    }`}
                  >
                    登录后开通
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => { setIsLoggedIn(true); setShowLogin(false); }} />}
    </div>
  );
}
