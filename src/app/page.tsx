import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-600 px-8 py-12 text-white">
        <h1 className="text-3xl font-bold leading-snug">
          用 AI 和数据
          <br />
          看懂世界杯的每一场球
        </h1>
        <p className="mt-3 max-w-xl text-emerald-50">
          赛程数据、AI 赛事报告、概率换算工具——我们卖的是信息和效率，
          不提供任何投注服务。
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/calculator"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
          >
            打开概率工具
          </Link>
          <Link
            href="/matches"
            className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            查看赛程
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            href: "/calculator",
            title: "概率工具",
            desc: "赔率 → 隐含概率换算、串关与复式注数实时计算。",
            ready: true,
          },
          {
            href: "/matches",
            title: "赛程与数据",
            desc: "104 场完整赛程与实时比分，北京时间显示。",
            ready: true,
          },
          {
            href: "/games",
            title: "积分竞猜",
            desc: "纯虚拟积分的趣味竞猜与排行榜，不涉及任何真钱。",
            ready: false,
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-emerald-300 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{card.title}</h2>
              {!card.ready && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  建设中
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-neutral-600">{card.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
