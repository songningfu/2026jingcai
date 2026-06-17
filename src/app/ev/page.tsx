import type { Metadata } from "next";
import { fetchEVMatches } from "@/lib/ev-data";
import EVClient from "./EVClient";

export const metadata: Metadata = {
  title: "EV 分析 — 竞彩赔率偏差测算",
  description:
    "基于中国体彩官方赔率的期望值(EV)测算。泊松模型反解真概率，找出体彩与模型的偏差点。仅供数学分析参考，不构成购彩建议。",
};

export const revalidate = 120;

export default async function EVPage() {
  const matches = await fetchEVMatches().catch(() => []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">EV 分析</h1>
        <p className="text-sm text-mut mt-1">
          选择场次 · 自动接入锐盘参考赔率 · 期望值测算 + 三档分级 + 串关推荐
        </p>
      </div>
      <EVClient matches={matches} />
    </main>
  );
}
