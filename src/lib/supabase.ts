import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * 服务端管理员客户端（service_role，绕过 RLS）。
 * 只允许在 Route Handler / Server Component / 定时任务中使用，
 * 绝不能传入客户端组件。
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 Supabase 环境变量");
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
