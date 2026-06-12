import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateAnalysis, resolveRunnableModel } from "@/lib/deep-run";
import { isValidDeviceId, openDeepRun } from "@/lib/games";

export const maxDuration = 120;

/**
 * POST /api/deep/run  { deviceId, matchId, modelId }
 * 按所选模型开启深度推演：扣对应积分 → 生成解读 → 返回。
 * 同场同模型只扣一次。
 */
export async function POST(req: NextRequest) {
  let deviceId: string, matchId: number, modelId: string;
  try {
    const b = await req.json();
    deviceId = String(b.deviceId);
    matchId = Number(b.matchId);
    modelId = String(b.modelId);
    if (!isValidDeviceId(deviceId) || !Number.isInteger(matchId) || !modelId) throw new Error();
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  // 校验模型可运行
  let spec;
  try {
    spec = resolveRunnableModel(modelId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "模型不可用" },
      { status: 400 },
    );
  }

  // 扣积分（同场同模型只扣一次）
  const charge = await openDeepRun(deviceId, matchId, modelId, spec.cost);
  if (!charge.ok) {
    return NextResponse.json(charge, { status: 400 });
  }

  // 生成模型解读（缓存命中则秒回）
  try {
    const analysis = await getOrGenerateAnalysis(matchId, spec);
    return NextResponse.json({
      ok: true,
      model: { id: spec.id, name: spec.name },
      points: charge.points,
      alreadyOpen: charge.alreadyOpen ?? false,
      analysis,
    });
  } catch (e) {
    // 生成失败：不黑用户积分——已扣的本次按已开启处理，下次免费重试
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "生成失败，请稍后重试（积分未浪费，可重试）" },
      { status: 500 },
    );
  }
}
