import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { matchId, deviceId, pick } = await req.json();
    if (!matchId || !deviceId || !["win", "loss"].includes(pick)) {
      return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 插入投票，冲突时忽略（每人每场只能投一次）
    await db.from("support_votes").upsert(
      { match_id: matchId, device_id: deviceId, pick },
      { onConflict: "match_id,device_id", ignoreDuplicates: true },
    );

    // 返回该场最新票数
    const { data } = await db
      .from("support_votes")
      .select("pick")
      .eq("match_id", matchId);

    const votes = data ?? [];
    let winVotes = votes.filter((v) => v.pick === "win").length;
    let lossVotes = votes.filter((v) => v.pick === "loss").length;
    // 与 feed API 保持一致：票数不足时加 25/25 底数，避免一票定乾坤
    if (winVotes + lossVotes < 10) {
      winVotes += 25;
      lossVotes += 25;
    }

    return NextResponse.json({ ok: true, winVotes, lossVotes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
