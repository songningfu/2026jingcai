import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { syncSportteryOdds } from "@/lib/sporttery-sync";

export const maxDuration = 60;

/**
 * GET /api/odds/sync?secret=...
 * 同步中国竞彩网公开足球计算器中的胜平负 / 让球胜平负赔率到 odds 表。
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSportteryOdds();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
