import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data } = await db
    .from("payment_orders")
    .select("id, email, plan, amount, pay_note, status, created_at, approved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { action, orderId } = await req.json();
  if (!orderId) return NextResponse.json({ ok: false, message: "缺少订单ID" }, { status: 400 });

  if (action === "reject") {
    const db = supabaseAdmin();
    const { data: order } = await db
      .from("payment_orders").select("status").eq("id", orderId).single();
    if (!order) return NextResponse.json({ ok: false, message: "订单不存在" }, { status: 404 });
    if (order.status !== "pending") return NextResponse.json({ ok: false, message: "订单已处理" }, { status: 400 });
    await db.from("payment_orders").update({ status: "rejected" }).eq("id", orderId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, message: "未知操作" }, { status: 400 });
}
