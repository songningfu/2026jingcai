import { NextRequest, NextResponse } from "next/server";
import { runDeepModel, type WhlInput } from "@/lib/deep-model";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/deep-model  body: { matchId }
 * 读取该场最新胜平负官方赔率，运行深度推演模型，返回概率分布与比分矩阵。
 * 纯数学模型，输出为不确定性量化，非预测胜负。
 */
export async function POST(req: NextRequest) {
  let matchId: number;
  try {
    matchId = Number((await req.json()).matchId);
    if (!Number.isInteger(matchId)) throw new Error();
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("odds")
      .select("outcome, odd, captured_at")
      .eq("match_id", matchId)
      .eq("play_type", "whl")
      .order("captured_at", { ascending: false })
      .limit(9);

    let odds: WhlInput | null = null;
    if (data && data.length >= 3) {
      const pick = (o: string) => {
        const row = data.find((r) => r.outcome === o);
        return row ? Number(row.odd) : NaN;
      };
      const win = pick("主胜");
      const draw = pick("平");
      const loss = pick("客胜");
      if ([win, draw, loss].every((v) => Number.isFinite(v) && v > 1)) {
        odds = { win, draw, loss };
      }
    }

    const result = runDeepModel(odds);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
