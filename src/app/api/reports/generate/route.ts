import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { generatePreviewReport, generateUpcomingReports } from "@/lib/reports";

export const maxDuration = 300; // 批量生成可能较慢

/**
 * GET /api/reports/generate?secret=...            → 为未来48h内未有报告的比赛批量生成（最多5场）
 * GET /api/reports/generate?secret=...&match=123  → 为指定比赛生成
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const matchParam = req.nextUrl.searchParams.get("match");
    if (matchParam) {
      const result = await generatePreviewReport(Number(matchParam));
      return NextResponse.json({ ok: true, match: Number(matchParam), ...result });
    }
    const result = await generateUpcomingReports();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
