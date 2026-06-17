import type { Metadata } from "next";
import Link from "next/link";
import { fetchEVMatches } from "@/lib/ev-data";
import ResultView from "./ResultView";

export const metadata: Metadata = {
  title: "分析结果 — EV分析",
  description: "所选比赛的期望值分析结果。仅供数学分析参考，不构成购彩建议。",
};

export const revalidate = 120;

export default async function EVResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const idSet = new Set(
    (ids ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  const all = await fetchEVMatches().catch(() => []);
  const matches = all.filter((m) => idSet.has(m.matchId));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">分析结果</h1>
          <p className="text-sm text-mut mt-1">
            {matches.length > 0
              ? `已分析 ${matches.length} 场 · 估算命中率 + 三档分级 + 串关`
              : "未找到对应场次"}
          </p>
        </div>
        <Link
          href="/ev"
          className="shrink-0 text-sm text-neon hover:text-neon-dim border border-line rounded-full px-4 py-1.5 transition hover:bg-raised/40"
        >
          ← 重新选择
        </Link>
      </div>

      {matches.length === 0 ? (
        <div className="card p-6 text-center text-mut text-sm">
          <p>没有可分析的场次。</p>
          <p className="text-xs text-faint mt-1">
            可能链接已过期或场次已开赛，请返回重新选择。
          </p>
          <Link href="/ev" className="inline-block mt-4 text-neon hover:text-neon-dim underline underline-offset-2">
            返回选择场次
          </Link>
        </div>
      ) : (
        <ResultView matches={matches} />
      )}
    </main>
  );
}
