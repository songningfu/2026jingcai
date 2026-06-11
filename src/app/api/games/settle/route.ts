import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { settleFinishedMatches } from "@/lib/games";

/**
 * GET /api/games/settle?secret=...
 * 手动/定时触发：结算所有「已完赛但仍有未结算竞猜」的比赛（幂等）。
 * sync 流程已自动调用本逻辑，此端点作为兜底与运维入口。
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await settleFinishedMatches();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
