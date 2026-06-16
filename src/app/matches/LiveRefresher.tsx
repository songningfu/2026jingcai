"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 有直播比赛时，每 60s 刷新一次页面数据 */
export default function LiveRefresher({ hasLive }: { hasLive: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [hasLive, router]);
  return null;
}
