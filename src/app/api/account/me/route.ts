import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { isValidDeviceId } from "@/lib/games";

/** POST { deviceId } -> 账户全貌（资料/订阅/历史） */
export async function POST(req: NextRequest) {
  try {
    const { deviceId } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    const account = await getAccount(deviceId);
    return NextResponse.json({ ok: true, account });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
