import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId, predict, type Pick } from "@/lib/games";

/** POST { deviceId, matchId, pick, stake } → 发起竞猜 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, matchId, pick, stake } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    const result = await predict(deviceId, Number(matchId), pick as Pick, Number(stake));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
