import type { Metadata } from "next";
import { fetchEVMatches } from "@/lib/ev-data";
import { analyzeMatches } from "@/lib/ev-engine";
import EVClient from "./EVClient";

export const metadata: Metadata = {
  title: "EV 分析 — 竞彩赔率偏差测算",
  description:
    "基于中国体彩官方赔率的期望值(EV)测算。泊松模型反解真概率，找出体彩与模型的偏差点。仅供数学分析参考，不构成购彩建议。",
};

export const revalidate = 120;

export default async function EVPage() {
  const matches = await fetchEVMatches().catch(() => []);

  if (matches.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold text-ink mb-2">EV 分析</h1>
        <p className="text-sm text-mut mb-6">
          基于体彩官方赔率的期望值(EV)测算 · Dixon-Coles 泊松模型 · 三档分级
        </p>
        <div className="card p-6 text-center text-mut text-sm">
          <p>暂无可分析的场次数据。</p>
          <p className="text-xs text-faint mt-1">
            需要近期有赔率的未开赛场次，请等待赔率同步后再查看。
          </p>
        </div>
      </main>
    );
  }

  const result = analyzeMatches(matches);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">EV 分析</h1>
        <p className="text-sm text-mut mt-1">
          基于体彩官方赔率 · Dixon-Coles 泊松模型 · 三档分级（稳健 / 价值 / 博胆）
        </p>
        <p className="text-xs text-faint mt-0.5">
          共 {matches.length} 场 · 生成于{" "}
          {new Date(result.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
        </p>
      </div>

      <EVClient result={result} />
    </main>
  );
}
