import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST { internalEmail, password }
 * 服务端中转 signInWithPassword，避免浏览器直连 Supabase（中国→新加坡高延迟）。
 * 香港服务器→Supabase 延迟低，成功率高很多。
 */
export async function POST(req: NextRequest) {
  try {
    const { internalEmail, password } = await req.json();
    if (!internalEmail || !password) {
      return NextResponse.json({ ok: false, error: "参数缺失" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db.auth.signInWithPassword({ email: internalEmail, password });

    if (error || !data.session) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
