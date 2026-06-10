import type { NextRequest } from "next/server";

/** 校验定时任务口令：Authorization: Bearer <CRON_SECRET> 或 ?secret= */
export function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}
