import { NextRequest, NextResponse } from "next/server";
import { isValidDeviceId, unlockDeepPrediction } from "@/lib/games";
import { getModel } from "@/lib/models";

/** POST { deviceId, matchId, modelId? } -> 用积分按所选大模型档位开启单场深度推演 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, matchId, modelId } = await req.json();
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    // 按所选模型定价
    let cost: number | undefined;
    if (modelId) {
      const spec = getModel(String(modelId));
      if (!spec) return NextResponse.json({ error: "未知模型" }, { status: 400 });
      cost = spec.cost;
    }
    const result = await unlockDeepPrediction(
      deviceId,
      Number(matchId),
      cost,
      modelId ? String(modelId) : undefined,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
