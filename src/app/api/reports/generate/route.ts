import { after, NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { generatePreviewReport, generateUpcomingReports } from "@/lib/reports";

export const maxDuration = 300; // 后台批量生成可能较慢

/**
 * GET /api/reports/generate?secret=...            → 后台批量生成未来48h内未有报告的比赛（最多5场）
 * GET /api/reports/generate?secret=...&match=123  → 同步为指定比赛生成（调试用）
 *
 * 批量模式用 after() 把生成放到响应之后跑：cron-job.org 立刻拿到 200，
 * 不会因生成耗时（5 篇约 2 分钟）触发其超时与「失败过多自动禁用」。
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const matchParam = req.nextUrl.searchParams.get("match");
  if (matchParam) {
    try {
      const result = await generatePreviewReport(Number(matchParam));
      return NextResponse.json({ ok: true, match: Number(matchParam), hits: result.hits });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // 批量：立刻返回，生成在后台进行
  after(async () => {
    try {
      const result = await generateUpcomingReports();
      console.log("[reports/generate] 后台完成:", JSON.stringify(result.generated));
    } catch (e) {
      console.error("[reports/generate] 后台失败:", e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.json({ ok: true, scheduled: true });
}
