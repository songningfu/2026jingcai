#!/usr/bin/env node
/**
 * 从 emrbli/worldcup SQL dump 导入：
 * 1. teams → 更新 teams 表的 coach / playing_style / key_players / wc_history
 * 2. historical_matchups → 新建/更新 team_h2h 表
 *
 * 用法:
 *   node scripts/import-emrbli-data.mjs --dry-run   # 只打印，不写库
 *   node scripts/import-emrbli-data.mjs --write      # 真正写入
 */

import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DUMP_URL = "https://raw.githubusercontent.com/emrbli/worldcup/main/db/dump/worldcup.sql.gz";
const LOCAL_CACHE = "/tmp/worldcup_emrbli.sql.gz";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");

loadEnvLocal();

function loadEnvLocal() {
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

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/** Parse a COPY ... FROM stdin block from pg SQL dump */
function parseCopyBlock(sql, table, columns) {
  const marker = `COPY public.${table} (`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`Table not found: ${table}`);
  const lineEnd = sql.indexOf("\n", start);
  const dataStart = lineEnd + 1;
  const dataEnd = sql.indexOf("\n\\.", dataStart);
  const block = sql.slice(dataStart, dataEnd);
  return block.split("\n").filter(Boolean).map((line) => {
    const vals = line.split("\t");
    const obj = {};
    columns.forEach((col, i) => {
      const raw = vals[i] ?? null;
      obj[col] = raw === "\\N" ? null : raw;
    });
    return obj;
  });
}

function parseJSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

async function main() {
  // ── 1. 下载 dump ──
  let gz;
  if (existsSync(LOCAL_CACHE)) {
    console.log("[cache] using", LOCAL_CACHE);
    gz = readFileSync(LOCAL_CACHE);
  } else {
    console.log("[download] fetching", DUMP_URL);
    gz = await download(DUMP_URL);
  }
  const sql = gunzipSync(gz).toString("utf8");
  console.log("[parse] dump size:", (sql.length / 1024 / 1024).toFixed(1), "MB");

  // ── 2. 解析 teams ──
  const teamCols = ["id", "fifa_code", "iso2", "name", "name_i18n", "confederation",
    "group_id", "is_host", "fifa_ranking", "logo_url", "source_ids", "updated_at", "status"];
  const rawTeams = parseCopyBlock(sql, "teams", teamCols);

  // 建立 emrbli_uuid → { name_en, name_zh, fd_id } 映射
  const teamMap = new Map(); // emrbli_id → info
  for (const t of rawTeams) {
    const i18n = parseJSON(t.name_i18n) ?? {};
    const src = parseJSON(t.source_ids) ?? {};
    teamMap.set(t.id, {
      name_en: t.name,
      name_zh: i18n.zh ?? null,
      fd_id: src.football_data ? Number(src.football_data) : null,
      fifa_code: t.fifa_code,
    });
  }
  console.log(`[teams] parsed ${teamMap.size} teams`);
  const zhCount = [...teamMap.values()].filter(t => t.name_zh).length;
  console.log(`[teams] with zh name: ${zhCount}`);

  // ── 3. 解析 team_profiles ──
  const profileCols = ["team_id", "coach", "style", "key_players", "wc_history",
    "qualifying_summary", "coach_nationality"];
  const rawProfiles = parseCopyBlock(sql, "team_profiles", profileCols);
  console.log(`[profiles] parsed ${rawProfiles.length} team profiles`);

  // ── 4. 解析 historical_matchups ──
  const h2hCols = ["id", "team_a_id", "team_b_id", "total_matches", "team_a_wins",
    "draws", "team_b_wins", "total_goals_team_a", "total_goals_team_b", "summary", "aggregate"];
  const rawH2H = parseCopyBlock(sql, "historical_matchups", h2hCols);
  console.log(`[h2h] parsed ${rawH2H.length} matchup records`);

  // ── 5. 打印预览 ──
  console.log("\n=== 队伍中文名样本 ===");
  [...teamMap.values()].filter(t => t.name_zh).slice(0, 8).forEach(t => {
    console.log(`  ${t.name_en} → ${t.name_zh} (fd_id=${t.fd_id})`);
  });

  console.log("\n=== 队伍档案样本 ===");
  rawProfiles.slice(0, 2).forEach(p => {
    const t = teamMap.get(p.team_id);
    console.log(`  ${t?.name_en ?? p.team_id}: 教练=${p.coach}, 风格=${p.style?.slice(0, 60)}...`);
    const kp = parseJSON(p.key_players);
    if (kp) console.log(`    关键球员: ${kp.map(k => k.name).join(", ")}`);
  });

  console.log("\n=== H2H 样本 ===");
  rawH2H.slice(0, 2).forEach(h => {
    const a = teamMap.get(h.team_a_id);
    const b = teamMap.get(h.team_b_id);
    console.log(`  ${a?.name_en ?? "?"} vs ${b?.name_en ?? "?"}: ${h.total_matches}场, ${h.team_a_wins}/${h.draws}/${h.team_b_wins}`);
    console.log(`    ${h.summary?.slice(0, 100)}...`);
  });

  if (!write) {
    console.log("\n[dry-run] 加 --write 真正写入 Supabase");
    return;
  }

  // ── 6. 写入 Supabase ──
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 6a. 更新 teams 表的中文名（若我们的 teams 表里 name_en 对应得上）
  console.log("\n[write] updating teams with zh names...");
  let teamUpdated = 0;
  for (const t of teamMap.values()) {
    if (!t.name_zh || !t.fd_id) continue;
    const { error } = await db.from("teams")
      .update({ name_zh: t.name_zh })
      .eq("id", t.fd_id);
    if (!error) teamUpdated++;
  }
  console.log(`[write] teams updated: ${teamUpdated}`);

  // 6b. 插入 team_profiles 到 Supabase（通过 fd_id 关联）
  // 先确保表存在（见 migration），然后 upsert
  const profileRows = rawProfiles.map(p => {
    const t = teamMap.get(p.team_id);
    if (!t?.fd_id) return null;
    return {
      team_fd_id: t.fd_id,
      team_name_en: t.name_en,
      coach: p.coach,
      coach_nationality: p.coach_nationality === "\\N" ? null : p.coach_nationality,
      style: p.style,
      key_players: parseJSON(p.key_players),
      wc_history: parseJSON(p.wc_history),
      qualifying_summary: p.qualifying_summary,
    };
  }).filter(Boolean);

  console.log(`[write] upserting ${profileRows.length} team profiles...`);
  if (profileRows.length > 0) {
    const { error } = await db.from("team_profiles").upsert(profileRows, { onConflict: "team_fd_id" });
    if (error) console.error("[error] team_profiles:", error.message);
    else console.log("[write] team_profiles done");
  }

  // 6c. 插入 team_h2h
  const h2hRows = rawH2H.map(h => {
    const a = teamMap.get(h.team_a_id);
    const b = teamMap.get(h.team_b_id);
    if (!a?.fd_id || !b?.fd_id) return null;
    return {
      team_a_fd_id: a.fd_id,
      team_b_fd_id: b.fd_id,
      team_a_name: a.name_en,
      team_b_name: b.name_en,
      total_matches: Number(h.total_matches),
      team_a_wins: Number(h.team_a_wins),
      draws: Number(h.draws),
      team_b_wins: Number(h.team_b_wins),
      total_goals_a: Number(h.total_goals_team_a),
      total_goals_b: Number(h.total_goals_team_b),
      summary: h.summary,
      meetings: parseJSON(h.aggregate)?.meetings ?? null,
    };
  }).filter(Boolean);

  console.log(`[write] upserting ${h2hRows.length} h2h records...`);
  for (let i = 0; i < h2hRows.length; i += 50) {
    const batch = h2hRows.slice(i, i + 50);
    const { error } = await db.from("team_h2h").upsert(batch, { onConflict: "team_a_fd_id,team_b_fd_id" });
    if (error) console.error(`[error] h2h batch ${i}:`, error.message);
  }
  console.log("[write] team_h2h done");

  console.log("\n✅ 导入完成");
}

main().catch(console.error);
