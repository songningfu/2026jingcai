import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "订阅" };

export default function PricingPage() {
  return (
    <ComingSoon
      title="订阅"
      desc="AI 深度报告与高级工具的订阅服务正在筹备中，当前全部功能免费开放。"
    />
  );
}
