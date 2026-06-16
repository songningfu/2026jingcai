#!/usr/bin/env node
/**
 * 从 emrbli/worldcup SQL dump 解析场馆信息，
 * 按开赛时间匹配写入 matches.venue_name / venue_city / venue_country。
 *
 * 用法:
 *   node scripts/populate-venues.mjs --dry-run
 *   node scripts/populate-venues.mjs --write
 */

import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const write = process.argv.includes("--write");
const DUMP_URL = "https://raw.githubusercontent.com/emrbli/worldcup/main/db/dump/worldcup.sql.gz";
const LOCAL_CACHE = "/tmp/worldcup_emrbli.sql.gz";

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return download(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parseCopyBlock(sql, table) {
  const marker = `COPY public.${table} (`;
  const start = sql.indexOf(marker);
  if (start === -1) return [];
  const rawCols = sql.slice(start + marker.length, sql.indexOf(")", start)).split(", ").map(s => s.trim());
  const headerEnd = sql.indexOf("\n", start);
  const dataStart = headerEnd + 1;
  const dataEnd = sql.indexOf("\n\\.", dataStart);
  return sql.slice(dataStart, dataEnd).split("\n").filter(Boolean).map(row => {
    const vals = row.split("\t");
    const obj = {};
    rawCols.forEach((col, i) => { obj[col] = vals[i] === "\\N" ? null : vals[i]; });
    return obj;
  });
}

async function main() {
  console.log(`模式：${write ? "写入" : "dry-run（只打印）"}\n`);

  let buf;
  if (existsSync(LOCAL_CACHE)) {
    console.log("使用本地缓存…");
    buf = readFileSync(LOCAL_CACHE);
  } else {
    console.log("下载 emrbli/worldcup dump…");
    buf = await download(DUMP_URL);
    writeFileSync(LOCAL_CACHE, buf);
  }

  const sql = gunzipSync(buf).toString("utf8");

  const venues = parseCopyBlock(sql, "venues");
  const cities = parseCopyBlock(sql, "cities");
  const emrbliMatches = parseCopyBlock(sql, "matches");

  const venueById = new Map(venues.map(v => [v.id, v]));
  const cityById = new Map(cities.map(c => [c.id, c]));

  // 构建 kickoff(UTC 分钟级) → 场馆信息的映射
  const venueByKickoff = new Map();
  for (const m of emrbliMatches) {
    const venue = m.venue_id ? venueById.get(m.venue_id) : null;
    if (!venue) continue;
    const city = venue.city_id ? cityById.get(venue.city_id) : null;
    // 归一化时间：截到分钟，去掉秒和时区偏移
    const kickoffKey = m.kickoff_utc?.slice(0, 16).replace(" ", "T") ?? null;
    if (kickoffKey) {
      venueByKickoff.set(kickoffKey, {
        venue_name: venue.name,
        venue_city: city?.name ?? null,
        venue_country: venue.country ?? city?.country ?? null,
      });
    }
  }
  console.log(`从 emrbli 解析出 ${venueByKickoff.size} 个场馆时间点`);

  // 读取我们库里的 matches
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data: ourMatches } = await db.from("matches").select("id, kickoff_at");
  console.log(`我们库里有 ${ourMatches.length} 场比赛`);

  const updates = [];
  for (const m of ourMatches) {
    const kickoffKey = m.kickoff_at?.slice(0, 16); // "2026-06-11T00:00"
    const info = venueByKickoff.get(kickoffKey);
    if (info) updates.push({ id: m.id, ...info });
  }

  console.log(`\n可匹配场馆：${updates.length} 场`);
  updates.slice(0, 8).forEach(u =>
    console.log(`  match ${u.id}: ${u.venue_name}, ${u.venue_city}, ${u.venue_country}`)
  );

  if (!write) {
    console.log("\n加 --write 参数真正写入。");
    return;
  }

  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error } = await db.from("matches").update({
      venue_name: u.venue_name,
      venue_city: u.venue_city,
      venue_country: u.venue_country,
    }).eq("id", u.id);
    if (error) { console.error(`  ✗ match ${u.id}:`, error.message); fail++; }
    else ok++;
  }
  console.log(`\n完成：成功 ${ok} 场，失败 ${fail} 场`);
}

main().catch(e => { console.error(e); process.exit(1); });
