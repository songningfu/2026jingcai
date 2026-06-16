"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 浏览器端 Supabase 客户端（anon key），仅用于邮箱账号登录的 Auth 流程。
 * 业务数据读写一律走服务端 service_role（lib/supabase.ts），不在前端直连。
 */
let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("缺少 Supabase 公开环境变量");
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "qiuyi_auth" },
  });
  return client;
}
