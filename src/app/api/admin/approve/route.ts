import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { grantSubscription } from "@/lib/account";
import { notifyUserActivated } from "@/lib/email";
import { checkCronAuth } from "@/lib/cron-auth";

const WC_DAYS = 40;

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ ok: false, message: "缺少订单 ID" }, { status: 400 });

    const db = supabaseAdmin();
    const { data: order, error } = await db
      .from("payment_orders")
      .select("id, email, plan, status")
      .eq("id", orderId)
      .single();
    if (error || !order) return NextResponse.json({ ok: false, message: "订单不存在" }, { status: 404 });
    if (order.status !== "pending") return NextResponse.json({ ok: false, message: "订单已处理" }, { status: 400 });

    // 按邮箱找用户 profile
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("email", order.email.toLowerCase())
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ ok: false, message: `邮箱 ${order.email} 未找到对应账号` }, { status: 404 });
    }

    // 授予订阅
    const { subExpires } = await grantSubscription(profile.id, order.plan as "pro" | "max", WC_DAYS);

    // 标记订单已通过
    await db
      .from("payment_orders")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", orderId);

    // 通知用户
    notifyUserActivated({ email: order.email, plan: order.plan, subExpires }).catch(console.error);

    return NextResponse.json({ ok: true, subExpires });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "服务异常" }, { status: 500 });
  }
}
