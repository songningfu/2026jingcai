import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId, redeemInviteCode } from "@/lib/games";

/** POST { deviceId, code } → 兑换邀请码 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, code } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });
    }
    const result = await redeemInviteCode(deviceId, code);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
