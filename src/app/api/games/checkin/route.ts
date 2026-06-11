import { NextRequest, NextResponse } from "next/server";
import { checkin, isValidDeviceId } from "@/lib/games";

/** POST { deviceId } → 每日签到 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    const result = await checkin(deviceId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
