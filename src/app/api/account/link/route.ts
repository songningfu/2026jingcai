import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId } from "@/lib/games";
import { linkAccount } from "@/lib/auth-link";

/** POST { deviceId, accessToken } -> 关联邮箱账号，返回登录后应使用的统一身份 id */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, accessToken } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ ok: false, error: "无效的设备标识" }, { status: 400 });
    }
    if (typeof accessToken !== "string" || accessToken.length < 10) {
      return NextResponse.json({ ok: false, error: "缺少登录凭证" }, { status: 400 });
    }
    const result = await linkAccount(deviceId, accessToken);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
