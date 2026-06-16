import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function auth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-admin-secret");
  return secret === process.env.CRON_SECRET;
}

type Target = "guest_profiles" | "predictions" | "points_ledger" | "unlocks" | "profiles" | "activation_codes";

const ALLOWED_TARGETS: Target[] = ["guest_profiles", "predictions", "points_ledger", "unlocks", "profiles", "activation_codes"];

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { targets }: { targets: Target[] } = await req.json();
  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ ok: false, message: "未指定清零目标" }, { status: 400 });
  }

  const invalid = targets.filter(t => !ALLOWED_TARGETS.includes(t));
  if (invalid.length > 0) {
    return NextResponse.json({ ok: false, message: `非法目标: ${invalid.join(", ")}` }, { status: 400 });
  }

  const db = supabaseAdmin();
  const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};

  for (const target of targets) {
    try {
      if (target === "guest_profiles") {
        // 删除无邮箱、无积分的历史访客记录
        const { error } = await db
          .from("profiles")
          .delete()
          .is("email", null)
          .eq("points", 0);
        results[target] = error ? { ok: false, error: error.message } : { ok: true };
      } else if (target === "profiles") {
        // 重置用户积分和订阅，但保留账号
        const { error } = await db
          .from("profiles")
          .update({ points: 0, sub_tier: null, sub_expires: null })
          .neq("id", "00000000-0000-0000-0000-000000000000");
        results[target] = error ? { ok: false, error: error.message } : { ok: true };
      } else {
        // 直接删除表中所有数据（profiles.id 是 uuid，其余表 id 是 bigint，用 gt 触发全删）
        const { error } = target === "activation_codes" || target === "predictions" || target === "points_ledger" || target === "unlocks"
          ? await db.from(target).delete().gte("id", 0)
          : await db.from(target).delete().neq("id", "");
        results[target] = error ? { ok: false, error: error.message } : { ok: true };
      }
    } catch (e) {
      results[target] = { ok: false, error: e instanceof Error ? e.message : "未知错误" };
    }
  }

  const allOk = Object.values(results).every(r => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
