import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { parseSportteryResponse } from "@/lib/sporttery";
import { syncSportteryOdds } from "@/lib/sporttery-sync";

/**
 * POST /api/odds/ingest?secret=...
 * body: 竞彩官网 getMatchCalculatorV1 的原始 JSON 响应。
 *
 * 由阿里云函数计算 FC（国内 IP）抓取后转发进来。竞彩官网拒绝境外 IP，
 * 故抓取必须在国内执行点完成；解析/匹配/入库仍在我们自己代码里。
 */
export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const raw = await req.json();
    const payload = parseSportteryResponse(raw);
    const result = await syncSportteryOdds(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
