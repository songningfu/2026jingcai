import type { Metadata } from "next";
import { emptySportteryPayload, getSportteryFootballOdds } from "@/lib/sporttery";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "概率工具 — 官方赔率 / 概率换算 / 串关计算",
  description:
    "中国竞彩网公开赔率展示、隐含概率换算、模拟金额、手动单场与串关计算。仅供参考，不构成购彩建议。",
};

export const revalidate = 60;

export default async function CalculatorPage() {
  const sportteryPayload = await getSportteryFootballOdds().catch((error) =>
    emptySportteryPayload(error instanceof Error ? error.message : String(error)),
  );

  return <Calculator sportteryPayload={sportteryPayload} />;
}
