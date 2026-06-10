import { NextRequest, NextResponse } from "next/server";
import { generatePreviewReport, type PreviewReport } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 300;

/** 进行中的生成任务去重：同一场比赛并发请求只打一次模型 */
const inflight = new Map<number, Promise<{ report: PreviewReport }>>();

/** 朴素 IP 限频：每分钟最多 3 次生成请求 */
const ipHits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 3) return true;
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

/**
 * POST /api/reports/on-demand  body: { matchId }
 * 用户在详情页点击「生成 AI 分析」时调用：已有报告直接返回，否则现场生成。
 */
export async function POST(req: NextRequest) {
  let matchId: number;
  try {
    const body = await req.json();
    matchId = Number(body.matchId);
    if (!Number.isInteger(matchId)) throw new Error();
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // 已有报告直接返回
  const { data: existing } = await db
    .from("reports")
    .select("preview_json")
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing?.preview_json) {
    return NextResponse.json({ report: existing.preview_json, cached: true });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "请求太频繁，请一分钟后再试" },
      { status: 429 },
    );
  }

  // 校验比赛存在
  const { data: match } = await db.from("matches").select("id").eq("id", matchId).maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "比赛不存在" }, { status: 404 });
  }

  try {
    let task = inflight.get(matchId);
    if (!task) {
      task = generatePreviewReport(matchId);
      inflight.set(matchId, task);
      task.finally(() => inflight.delete(matchId));
    }
    const { report } = await task;
    return NextResponse.json({ report, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "生成失败，请稍后重试" },
      { status: 500 },
    );
  }
}
