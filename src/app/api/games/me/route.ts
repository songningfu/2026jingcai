import { NextRequest, NextResponse } from "next/server";
import { getMe, isValidDeviceId, registerOrGet } from "@/lib/games";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST { deviceId, nickname?, register? }
 * register=true（默认）：不存在时自动建档（游戏页行为）
 * register=false：只读，profile 不存在直接返回空（账户页行为）
 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, nickname, register = true } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }

    if (!register) {
      // 只读模式：profile 不存在直接返回空
      const db = supabaseAdmin();
      const { data: existing } = await db
        .from("profiles")
        .select("id")
        .eq("id", deviceId)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ ok: true, profile: null, predictions: [], unlocks: [], rank: null, inviteCount: 0 });
      }
    }

    if (nickname !== undefined) await registerOrGet(deviceId, String(nickname));
    const data = await getMe(deviceId);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
