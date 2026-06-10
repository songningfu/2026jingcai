import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "体彩官方赔率",
  description:
    "展示中国竞彩网公开足球赔率，提供胜平负、让球胜平负的模拟金额与隐含概率换算。仅供参考，不提供下单。",
};

export const revalidate = 60;

export default function OddsPage() {
  redirect("/calculator");
}
