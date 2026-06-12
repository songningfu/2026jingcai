import type { Metadata } from "next";
import Link from "next/link";
import { SUB_PLANS } from "@/lib/subscriptions";

export const metadata: Metadata = {
  title: "订阅",
  description:
    "球译订阅 Free / Pro / Max：解锁大模型深度推演、签到积分加成与尊享标识。订阅为分析工具使用权益，非预测结果，不构成购彩建议。",
};

const ORDER = ["free", "pro", "max"] as const;

export default function PricingPage() {
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
                {tier !== "free" && <span className="ml-1 text-xs text-faint">· 资质就绪后开放</span>}
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
                {tier === "free" ? (
                  <Link
                    href="/games"
                    className="block rounded-lg border border-line-strong py-2.5 text-center text-sm font-medium text-ink transition hover:border-neon/50"
                  >
                    免费畅玩
                  </Link>
                ) : (
                  <Link
                    href="/account"
                    className={`block rounded-lg py-2.5 text-center text-sm font-semibold transition ${
                      isPro
                        ? "bg-neon text-white hover:brightness-110"
                        : "bg-amber text-white hover:brightness-110"
                    }`}
                  >
                    去开通
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-6 p-5">
        <h3 className="text-sm font-semibold text-ink">关于开通方式</h3>
        <p className="mt-2 text-xs leading-relaxed text-mut">
          正式收款功能正在完成合规资质（规格第 8.3 条），暂未上线在线支付。当前 Pro / Max 通过
          <strong className="text-ink">「开通码」手动开通</strong>——在
          <Link href="/account" className="text-neon hover:underline">
            账户
          </Link>
          页输入开通码即可激活。我们不会在资质就绪前设计任何规避资质的收款方式。
        </p>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-faint">
        订阅权益为站内 AI 分析工具的使用权，与积分体系相互独立；积分纯虚拟，不可充值、不可提现、不可兑换现金。
        所有分析仅供参考，不构成任何购彩建议，理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </div>
  );
}
