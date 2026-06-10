import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "积分竞猜" };

export default function GamesPage() {
  return (
    <ComingSoon
      title="积分竞猜"
      desc="纯虚拟积分的趣味竞猜与排行榜即将上线。积分不可充值、不可提现、不可兑换任何现金等价物。"
    />
  );
}
