import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateCode } from "@/lib/account";

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

/** GET /api/admin/codes?secret=... — 列出所有激活码 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("activation_codes")
    .select("id, code, tier, days, note, is_active, used_at, used_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data });
}

/** POST /api/admin/codes?secret=... — 生成激活码
 *  body: { tier: "pro"|"max", days: number, count?: number, note?: string }
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { tier, days, count = 1, note } = body;
  if (!["pro", "max"].includes(tier) || !Number.isInteger(days) || days < 1) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const rows = Array.from({ length: Math.min(count, 50) }, () => ({
    code: generateCode(),
    tier,
    days,
    note: note || null,
  }));
  const { data, error } = await db.from("activation_codes").insert(rows).select("code");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, codes: data?.map(r => r.code) });
}

/** PATCH /api/admin/codes?secret=... — 作废激活码
 *  body: { id: number }
 */
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await req.json();
  const db = supabaseAdmin();
  const { error } = await db.from("activation_codes").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
