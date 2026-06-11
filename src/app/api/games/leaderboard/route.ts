import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/games";

export const revalidate = 30;

/** GET → 积分排行榜 Top 50 */
export async function GET() {
  try {
    const rows = await leaderboard();
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
