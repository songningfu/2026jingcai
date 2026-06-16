import type { Metadata } from "next";
import { emptySportteryPayload, getSportteryFootballOdds } from "@/lib/sporttery";
import { getOddsBoardFromDb } from "@/lib/sporttery-fallback";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "赔率工具 — 官方赔率 / 概率换算 / 串关计算",
  description:
    "中国竞彩网公开赔率展示、隐含概率换算、模拟金额与串关计算。仅供参考，不构成购彩建议。",
};

export const revalidate = 60;

export default async function CalculatorPage() {
  let payload = await getSportteryFootballOdds().catch((error) =>
    emptySportteryPayload(error instanceof Error ? error.message : String(error)),
  );
  if (payload.days.length === 0) {
    const fallback = await getOddsBoardFromDb().catch(() => null);
    if (fallback && fallback.days.length > 0) payload = fallback;
  }

  return <Calculator sportteryPayload={payload} />;
}
