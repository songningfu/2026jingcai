import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();

  const [
    { count: totalUsers },
    { count: activeSubs },
    { count: totalCodes },
    { count: usedCodes },
    { data: pointsData },
    { count: totalPredictions },
    { count: totalUnlocks },
    { count: pendingOrders },
    { data: recentUsers },
  ] = await Promise.all([
    db.from("profiles").select("*", { count: "exact", head: true }),
    db.from("profiles").select("*", { count: "exact", head: true })
      .gt("sub_expires", new Date().toISOString()),
    db.from("activation_codes").select("*", { count: "exact", head: true }),
    db.from("activation_codes").select("*", { count: "exact", head: true }).not("used_at", "is", null),
    db.from("profiles").select("points"),
    db.from("predictions").select("*", { count: "exact", head: true }),
    db.from("unlocks").select("*", { count: "exact", head: true }),
    db.from("payment_orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("profiles").select("id, nickname, email, sub_tier, sub_expires, created_at")
      .order("created_at", { ascending: false }).limit(5),
  ]);

  const totalPoints = (pointsData ?? []).reduce((s: number, r: { points: number }) => s + (r.points ?? 0), 0);

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    activeSubs: activeSubs ?? 0,
    totalCodes: totalCodes ?? 0,
    usedCodes: usedCodes ?? 0,
    totalPoints,
    totalPredictions: totalPredictions ?? 0,
    totalUnlocks: totalUnlocks ?? 0,
    pendingOrders: pendingOrders ?? 0,
    recentUsers: recentUsers ?? [],
  });
}
