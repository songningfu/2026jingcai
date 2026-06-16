import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST { username }
 * → 查询该用户名对应的内部邮箱（存于 profiles.email），供客户端 signInWithPassword 使用。
 */
export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return NextResponse.json({ ok: false, error: "缺少用户名" }, { status: 400 });
    }

    const { data } = await supabaseAdmin()
      .from("profiles")
      .select("email")
      .ilike("username", username.trim())
      .not("email", "is", null)
      .maybeSingle();

    if (!data?.email) {
      return NextResponse.json({ ok: false, error: "用户名不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, internalEmail: data.email });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
