import { NextRequest, NextResponse } from "next/server";
import { redeemCode } from "@/lib/account";
import { isValidDeviceId } from "@/lib/games";
import { supabaseAdmin } from "@/lib/supabase";

/** POST { deviceId, code } -> 兑换开通码（手动开通，规格 8.3） */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, code } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false, message: "请输入开通码" }, { status: 400 });
    }

    // 必须已注册账号才能兑换
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", deviceId)
      .maybeSingle();
    if (!profile?.username) {
      return NextResponse.json({ ok: false, message: "请先注册/登录账号再兑换激活码" }, { status: 403 });
    }

    const result = await redeemCode(deviceId, code);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
