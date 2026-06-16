"use client";
import Link from "next/link";

const QQ_GROUP = "490961406";

export default function BuyPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center mb-8">
        <p className="font-num text-xs font-semibold tracking-[0.3em] text-neon">GET STARTED</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">加入用户群开通订阅</h1>
        <p className="mt-2 text-sm text-mut">入群后私聊群主，即可获取激活码</p>
      </div>

      {/* QQ 群信息 */}
      <div className="card p-6 flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-[#1aad19]/10 flex items-center justify-center">
          <span className="text-3xl">QQ</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">球译2026 用户群</p>
          <p className="font-num mt-1 text-2xl font-bold tracking-widest text-neon">{QQ_GROUP}</p>
        </div>
        <a
          href={`mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP}&card_type=group&source=qr`}
          className="w-full rounded-lg bg-neon py-3 text-center text-sm font-semibold text-white transition hover:brightness-110"
        >
          点击加入 QQ 群
        </a>
        <p className="text-xs text-faint">或在 QQ 中搜索群号 <span className="font-num font-semibold text-mut">{QQ_GROUP}</span></p>
      </div>

      {/* 步骤 */}
      <div className="card mt-4 p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">开通步骤</h2>
        <ol className="space-y-3">
          {[
            "搜索群号或扫码加入「球译2026」",
            "入群后私聊群主，告知套餐（Pro ¥20 / Max ¥49.9）",
            "付款后群主发送激活码",
            "前往账户页输入激活码，立即生效",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-mut">
              <span className="font-num mt-0.5 min-w-[1.5rem] rounded bg-raised px-1 py-0.5 text-center text-xs font-bold text-ink">
                {i + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 flex gap-3">
        <Link
          href="/account"
          className="flex-1 rounded-lg border border-line-strong py-2.5 text-center text-sm font-medium text-ink transition hover:border-neon/50"
        >
          已有激活码 → 去激活
        </Link>
        <Link
          href="/pricing"
          className="flex-1 rounded-lg border border-line-strong py-2.5 text-center text-sm font-medium text-ink transition hover:border-neon/50"
        >
          查看套餐详情
        </Link>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-faint">
        订阅权益为站内 AI 分析工具使用权，不构成任何购彩建议。理性娱乐，未满 18 周岁禁止购彩。
      </p>
    </div>
  );
}
