import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { grantSubscription } from "@/lib/account";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

/** GET /api/admin/users?secret=...&q=搜索词 — 用户列表 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const db = supabaseAdmin();

  let query = db
    .from("profiles")
    .select("id, nickname, username, email, points, sub_type, sub_expires, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    const filters = [`email.ilike.%${q}%`, `nickname.ilike.%${q}%`];
    if (UUID_RE.test(q)) filters.push(`id.eq.${q}`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

/** PATCH /api/admin/users?secret=... — 修改用户
 *  body: { userId, action: "grant_sub"|"add_points"|"reset_points", tier?, days?, points? }
 */
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId, id, action, tier, days, points, delta } = await req.json();
  const uid = userId ?? id;
  if (!uid) return NextResponse.json({ error: "userId 必填" }, { status: 400 });

  const db = supabaseAdmin();

  if (action === "grant_sub") {
    if (!["pro", "max"].includes(tier) || !Number.isInteger(days) || days < 1)
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    // 只允许对已注册账号授权
    const { data: target } = await db.from("profiles").select("username").eq("id", uid).maybeSingle();
    if (!target?.username)
      return NextResponse.json({ error: "该用户尚未注册账号，无法授予订阅" }, { status: 400 });
    const result = await grantSubscription(uid, tier, days);
    return NextResponse.json(result);
  }

  if (action === "add_points") {
    // 只允许对已注册账号操作积分
    const { data: target } = await db.from("profiles").select("username, points").eq("id", uid).maybeSingle();
    if (!target?.username)
      return NextResponse.json({ error: "该用户尚未注册账号，无法操作积分" }, { status: 400 });
    const current = (target?.points as number) ?? 0;
    const amount = Number(delta ?? points ?? 0);
    const { error } = await db.from("profiles").update({ points: current + amount }).eq("id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, points: current + amount });
  }

  if (action === "reset_points") {
    const { error } = await db.from("profiles").update({ points: 0 }).eq("id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}
