import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId, registerOrGet } from "@/lib/games";
import { supabaseAdmin } from "@/lib/supabase";

export const EV_ANALYSIS_COST = 150; // 每次消耗积分

/**
 * POST { deviceId }
 * 首次免费；后续每次扣 150 积分。
 * 返回 { ok, free, pointsLeft } 或 { error, pointsLeft }
 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 确保档案存在（没有则自动注册）
    await registerOrGet(deviceId);

    const { data: profile, error } = await db
      .from("profiles")
      .select("id, points, ev_free_used")
      .eq("id", deviceId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "查询用户失败" }, { status: 500 });
    }

    // 首次免费
    if (!profile.ev_free_used) {
      await db
        .from("profiles")
        .update({ ev_free_used: true })
        .eq("id", deviceId);
      return NextResponse.json({ ok: true, free: true, pointsLeft: profile.points });
    }

    // 积分不足
    if (profile.points < EV_ANALYSIS_COST) {
      return NextResponse.json(
        { error: `积分不足，本次分析需 ${EV_ANALYSIS_COST} 积分，当前 ${profile.points} 积分`, pointsLeft: profile.points },
        { status: 402 },
      );
    }

    // 扣积分
    const newPoints = profile.points - EV_ANALYSIS_COST;
    await db.from("profiles").update({ points: newPoints }).eq("id", deviceId);
    await db.from("points_ledger").insert({
      user_id: deviceId,
      delta: -EV_ANALYSIS_COST,
      reason: "ev_analysis",
      balance_after: newPoints,
    });

    return NextResponse.json({ ok: true, free: false, pointsLeft: newPoints });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
