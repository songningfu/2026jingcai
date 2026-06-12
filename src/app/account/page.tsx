import type { Metadata } from "next";
import AccountClient from "./AccountClient";

export const metadata: Metadata = {
  title: "我的账户",
  description: "查看积分、订阅状态、深度推演与竞猜记录，输入开通码激活订阅。",
};

export default function AccountPage() {
  return <AccountClient />;
}
