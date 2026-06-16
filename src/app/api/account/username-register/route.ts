import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { isValidDeviceId, registerOrGet } from "@/lib/games";
import { supabaseAdmin } from "@/lib/supabase";

const USERNAME_RE = /^[a-zA-Z0-9_一-鿿]{2,16}$/;

/**
 * POST { deviceId, username, password }
 * → 注册用户名账号。内部邮箱用 UUID 生成（避免中文字符），存到 profiles.email。
 *   返回 { ok, internalEmail } 供客户端 signInWithPassword 完成登录。
 */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, username, password } = await req.json();

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ ok: false, error: "无效的设备标识" }, { status: 400 });
    }
    if (!username || !USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false, error: "用户名 2-16 位，支持中文、字母、数字、下划线" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "密码至少 6 位" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 检查用户名是否已被占用
    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: false, error: "该用户名已被使用" }, { status: 409 });
    }

    // UUID 邮箱：纯 ASCII，不含用户名，Supabase 必然接受
    const internalEmail = `u${randomUUID().replace(/-/g, "")}@internal.qiuyi.app`;

    // 用 service_role 创建 Auth 用户（跳过邮箱确认）
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return NextResponse.json({ ok: false, error: createErr?.message ?? "注册失败" }, { status: 500 });
    }

    // 确保 profile 存在（未登录时不会被自动建档），再写 username + 内部邮箱
    // linkAccount 稍后会写 auth_user_id
    await registerOrGet(deviceId);
    await db
      .from("profiles")
      .update({ username, email: internalEmail })
      .eq("id", deviceId);

    return NextResponse.json({ ok: true, internalEmail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
