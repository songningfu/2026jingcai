import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

function dayKey(ts: string, tz = 8) {
  const d = new Date(new Date(ts).getTime() + tz * 3600000);
  return d.toISOString().slice(5, 10); // MM-DD
}

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 8 * 3600000 - i * 86400000);
    days.push(d.toISOString().slice(5, 10));
  }
  return days;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00+08:00").toISOString();

  const [
    { data: ledger7 },
    { data: regs7 },
    { data: emailCount },
    { data: guestCount },
    { data: allPreds },
    { data: settledPreds },
    { data: allLedger },
    { data: todayLedger },
    { count: reportCount },
    { data: allUnlocks },
    { data: matchNames },
  ] = await Promise.all([
    // 最近7天积分流水（用于日活）
    db.from("points_ledger").select("user_id, created_at").gte("created_at", since7),
    // 最近7天注册
    db.from("profiles").select("id, created_at").gte("created_at", since7),
    // 绑定邮箱用户数
    db.from("profiles").select("id", { count: "exact", head: true }).not("email", "is", null),
    // 纯游客（无邮箱）
    db.from("profiles").select("id", { count: "exact", head: true }).is("email", null),
    // 所有竞猜
    db.from("predictions").select("match_id, pick, settled, won"),
    // 已结算
    db.from("predictions").select("won").eq("settled", true),
    // 全量积分流水（汇总用）
    db.from("points_ledger").select("reason, delta"),
    // 今日流水
    db.from("points_ledger").select("reason, user_id").gte("created_at", todayStart),
    // 报告总数
    db.from("reports").select("*", { count: "exact", head: true }),
    // 全量解锁记录
    db.from("unlocks").select("match_id, model_id, created_at").order("created_at", { ascending: false }),
    // 比赛名称（用于 top 比赛展示）
    db.from("matches").select("id, home_team_id, away_team_id, kickoff_at, status"),
  ]);

  const days = last7Days();

  // 日活趋势（distinct user_id per day）
  const dauMap = new Map<string, Set<string>>();
  days.forEach(d => dauMap.set(d, new Set()));
  (ledger7 ?? []).forEach(r => {
    const day = dayKey(r.created_at);
    if (dauMap.has(day)) dauMap.get(day)!.add(r.user_id);
  });
  const dauTrend = days.map(d => ({ date: d, count: dauMap.get(d)?.size ?? 0 }));

  // 今日&昨日活跃
  const todayKey = days[6];
  const yesterdayKey = days[5];
  const todayActive = dauMap.get(todayKey)?.size ?? 0;
  const yesterdayActive = dauMap.get(yesterdayKey)?.size ?? 0;

  // 7日注册趋势
  const regMap = new Map<string, number>();
  days.forEach(d => regMap.set(d, 0));
  (regs7 ?? []).forEach(r => {
    if (!r.created_at) return;
    const day = dayKey(r.created_at);
    if (regMap.has(day)) regMap.set(day, (regMap.get(day) ?? 0) + 1);
  });
  const regTrend = days.map(d => ({ date: d, count: regMap.get(d) ?? 0 }));

  // 今日签到人数
  const todayCheckins = (todayLedger ?? []).filter(r => r.reason === "checkin").length;
  const todayActiveUsers = new Set((todayLedger ?? []).map(r => r.user_id)).size;

  // 竞猜投注偏好
  const pickDist = { win: 0, draw: 0, loss: 0 };
  (allPreds ?? []).forEach(p => {
    if (p.pick in pickDist) pickDist[p.pick as keyof typeof pickDist]++;
  });

  // 胜率
  const wonCount = (settledPreds ?? []).filter(p => p.won).length;
  const settledTotal = settledPreds?.length ?? 0;
  const winRate = settledTotal > 0 ? Math.round((wonCount / settledTotal) * 100) : 0;

  // 热门比赛 TOP5（按竞猜次数）
  const matchPredCount = new Map<number, number>();
  (allPreds ?? []).forEach(p => {
    matchPredCount.set(p.match_id, (matchPredCount.get(p.match_id) ?? 0) + 1);
  });
  const matchMap = new Map((matchNames ?? []).map(m => [m.id, m]));
  const topPredMatches = [...matchPredCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const m = matchMap.get(id);
      return { match_id: id, count, kickoff_at: m?.kickoff_at ?? null, status: m?.status ?? null };
    });

  // 积分流水汇总
  type LedgerSummary = { count: number; totalIn: number; totalOut: number };
  const ledgerByReason: Record<string, LedgerSummary> = {};
  (allLedger ?? []).forEach(r => {
    if (!ledgerByReason[r.reason]) ledgerByReason[r.reason] = { count: 0, totalIn: 0, totalOut: 0 };
    ledgerByReason[r.reason].count++;
    if (r.delta > 0) ledgerByReason[r.reason].totalIn += r.delta;
    else ledgerByReason[r.reason].totalOut += Math.abs(r.delta);
  });

  // 模型解锁分布
  const modelDist: Record<string, number> = {};
  (allUnlocks ?? []).forEach(u => {
    modelDist[u.model_id || "basic"] = (modelDist[u.model_id || "basic"] ?? 0) + 1;
  });

  // 近期解锁（最新10条）
  const recentUnlocks = (allUnlocks ?? []).slice(0, 10).map(u => ({
    match_id: u.match_id,
    model_id: u.model_id,
    created_at: u.created_at,
  }));

  // 解锁热门比赛
  const matchUnlockCount = new Map<number, number>();
  (allUnlocks ?? []).forEach(u => {
    matchUnlockCount.set(u.match_id, (matchUnlockCount.get(u.match_id) ?? 0) + 1);
  });
  const topUnlockMatches = [...matchUnlockCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ match_id: id, count }));

  return NextResponse.json({
    // 日活
    dauTrend,
    todayActive,
    yesterdayActive,
    todayCheckins,
    todayActiveUsers,
    // 注册
    regTrend,
    emailUsers: (emailCount as unknown as { count: number } | null)?.count ?? 0,
    guestUsers: (guestCount as unknown as { count: number } | null)?.count ?? 0,
    // 竞猜
    pickDist,
    totalPreds: allPreds?.length ?? 0,
    settledCount: settledTotal,
    wonCount,
    winRate,
    topPredMatches,
    // 积分
    ledgerByReason,
    // AI模型
    reportCount: reportCount ?? 0,
    modelDist,
    recentUnlocks,
    topUnlockMatches,
  });
}
