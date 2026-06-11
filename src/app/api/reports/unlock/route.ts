import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId, unlockDeepPrediction } from "@/lib/games";

/** POST { deviceId, matchId } -> 用积分解锁单场深度预测 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, matchId } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    const result = await unlockDeepPrediction(deviceId, Number(matchId));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
