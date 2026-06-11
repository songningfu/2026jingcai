import { NextRequest, NextResponse } from "next/server";
import { getMe, isValidDeviceId, registerOrGet } from "@/lib/games";

/** POST { deviceId, nickname? } → 注册/读取并返回资料、竞猜记录、排名 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, nickname } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
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
