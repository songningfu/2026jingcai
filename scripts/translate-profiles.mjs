#!/usr/bin/env node
/**
 * 用 DeepSeek 批量翻译 team_profiles.style 和 team_h2h.summary 为中文
 * node scripts/translate-profiles.mjs --dry-run
 * node scripts/translate-profiles.mjs --write
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const write = args.has("--write");

function loadEnv() {
  const path = join(__dirname, "../.env.local");
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

async function translate(text) {
  if (!text) return null;
  const res = await fetch(`${process.env.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是专业足球翻译。将以下英文足球内容翻译成简体中文，保持专业性，输出只有译文，不要解释。",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function main() {
  // ── 1. 翻译 team_profiles.style ──
  const { data: profiles } = await db
    .from("team_profiles")
    .select("team_fd_id, team_name_en, style")
    .not("style", "is", null);

  console.log(`[profiles] ${profiles?.length ?? 0} 条风格描述待翻译`);

  for (const p of profiles ?? []) {
    const zh = await translate(p.style);
    console.log(`  ${p.team_name_en}: ${zh?.slice(0, 60)}...`);
    if (write && zh) {
      await db.from("team_profiles").update({ style: zh }).eq("team_fd_id", p.team_fd_id);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // ── 2. 翻译 team_h2h.summary ──
  const { data: h2hRows } = await db
    .from("team_h2h")
    .select("id, team_a_name, team_b_name, summary")
    .not("summary", "is", null);

  console.log(`\n[h2h] ${h2hRows?.length ?? 0} 条交锋摘要待翻译`);

  for (const h of h2hRows ?? []) {
    const zh = await translate(h.summary);
    console.log(`  ${h.team_a_name} vs ${h.team_b_name}: ${zh?.slice(0, 60)}...`);
    if (write && zh) {
      await db.from("team_h2h").update({ summary: zh }).eq("id", h.id);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!write) console.log("\n[dry-run] 加 --write 写入数据库");
  else console.log("\n✅ 翻译完成");
}

main().catch(console.error);
