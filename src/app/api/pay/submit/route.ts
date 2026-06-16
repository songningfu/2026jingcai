import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyAdminNewOrder } from "@/lib/email";

const PLANS: Record<string, number> = { pro: 20, max: 49.9 };
const WC_DAYS = 40; // 世界杯期间

export { WC_DAYS };

export async function POST(req: NextRequest) {
  try {
    const { email, plan, payNote } = await req.json();
    if (!email || !plan || !PLANS[plan]) {
      return NextResponse.json({ ok: false, message: "参数错误" }, { status: 400 });
    }
    const amount = PLANS[plan];
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("payment_orders")
      .insert({ email: email.trim().toLowerCase(), plan, amount, pay_note: payNote ?? "" })
      .select("id")
      .single();
    if (error) throw error;
    // 异步通知管理员（不阻塞响应）
    notifyAdminNewOrder({ orderId: data.id, email, plan, amount, payNote: payNote ?? "" }).catch(console.error);
    return NextResponse.json({ ok: true, orderId: data.id });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "服务异常" }, { status: 500 });
  }
}
