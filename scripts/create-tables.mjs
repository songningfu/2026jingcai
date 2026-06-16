import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

function loadEnv() {
  const path = new URL("../.env.local", import.meta.url).pathname;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 直接用 Supabase REST API 创建表（通过插入空记录触发建表不可行）
// 改用 SQL migration 方式：在 supabase/migrations/ 里加文件，然后手动执行
// 或直接用 service role 调用 pg 执行 DDL

// 试试 insert 来判断表是否存在
async function tableExists(name) {
  const { error } = await db.from(name).select("id").limit(1);
  return !error || !error.message.includes("does not exist");
}

async function main() {
  const tp = await tableExists("team_profiles");
  const h2h = await tableExists("team_h2h");
  console.log("team_profiles exists:", tp);
  console.log("team_h2h exists:", h2h);

  if (!tp || !h2h) {
    console.log("\n需要手动在 Supabase Dashboard SQL Editor 执行以下 SQL：");
    console.log(`
CREATE TABLE IF NOT EXISTS team_profiles (
  team_fd_id bigint PRIMARY KEY,
  team_name_en text,
  coach text,
  coach_nationality text,
  style text,
  key_players jsonb,
  wc_history jsonb,
  qualifying_summary text,
  updated_at timestamptz default now()
);
ALTER TABLE team_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read team_profiles" ON team_profiles;
CREATE POLICY "public read team_profiles" ON team_profiles FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS team_h2h (
  id bigserial PRIMARY KEY,
  team_a_fd_id bigint,
  team_b_fd_id bigint,
  team_a_name text,
  team_b_name text,
  total_matches int,
  team_a_wins int,
  draws int,
  team_b_wins int,
  total_goals_a int,
  total_goals_b int,
  summary text,
  meetings jsonb,
  UNIQUE(team_a_fd_id, team_b_fd_id)
);
ALTER TABLE team_h2h ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read team_h2h" ON team_h2h;
CREATE POLICY "public read team_h2h" ON team_h2h FOR SELECT USING (true);
    `);
  } else {
    console.log("两张表都已存在，可以直接运行 import 脚本");
  }
}

main().catch(console.error);
