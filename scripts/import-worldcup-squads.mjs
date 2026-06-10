#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DUMP_URL =
  "https://raw.githubusercontent.com/emrbli/worldcup/main/db/dump/worldcup.sql.gz";
const SOURCE = "emrbli/worldcup";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

loadEnvLocal();

function usage() {
  console.log(`Usage:
  npm run import:squads:dry
  npm run import:squads -- --write
  node scripts/import-worldcup-squads.mjs --dry-run --limit=20

Default mode is dry-run. Add --write to replace prior ${SOURCE} rows in squads.`);
}

if (args.has("--help")) {
  usage();
  process.exit(0);
}

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseCopyValue(value) {
  if (value === "\\N") return null;
  return value
    .replaceAll("\\\\", "\\")
    .replaceAll("\\t", "\t")
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r");
}

function parseCopySection(sql, table) {
  const marker = `COPY public.${table} (`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`COPY section not found: ${table}`);
  const headerEnd = sql.indexOf("\n", start);
  const header = sql.slice(start, headerEnd);
  const columns = header
    .slice(marker.length, header.indexOf(") FROM stdin;"))
    .split(",")
    .map((column) => column.trim().replace(/^"|"$/g, ""));

  const rows = [];
  let pos = headerEnd + 1;
  while (pos < sql.length) {
    const next = sql.indexOf("\n", pos);
    if (next < 0) break;
    const line = sql.slice(pos, next);
    pos = next + 1;
    if (line === "\\.") break;
    const values = line.split("\t").map(parseCopyValue);
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }
  return rows;
}

function parseJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function fetchDumpSql() {
  console.log(`[squads] downloading ${DUMP_URL}`);
  const res = await fetch(DUMP_URL, {
    headers: {
      "User-Agent": "jingcai-squad-import/1.0",
      Accept: "application/gzip, application/octet-stream, */*",
    },
  });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  console.log(`[squads] downloaded ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
  return gunzipSync(bytes).toString("utf8");
}

function buildRows(sql) {
  const teams = parseCopySection(sql, "teams");
  const players = parseCopySection(sql, "players");

  const teamUuidToFootballDataId = new Map();
  const skippedTeams = [];
  for (const team of teams) {
    const sourceIds = parseJson(team.source_ids);
    const footballDataId = Number(sourceIds.football_data);
    if (Number.isFinite(footballDataId)) {
      teamUuidToFootballDataId.set(team.id, footballDataId);
    } else {
      skippedTeams.push(team.name);
    }
  }

  const skippedPlayers = [];
  const rows = [];
  for (const player of players) {
    const teamId = teamUuidToFootballDataId.get(player.team_id);
    if (!teamId) {
      skippedPlayers.push(player.name);
      continue;
    }
    rows.push({
      match_id: null,
      team_id: teamId,
      player_name: player.name,
      position: player.position,
      status: "squad",
      shirt_number: player.number ? Number(player.number) : null,
      club: player.club,
      date_of_birth: player.date_of_birth,
      nationality: player.nationality,
      source: SOURCE,
      source_ids: parseJson(player.source_ids),
      updated_at: new Date().toISOString(),
    });
  }

  return {
    rows: limit && Number.isFinite(limit) ? rows.slice(0, limit) : rows,
    fullCount: rows.length,
    teamCount: teamUuidToFootballDataId.size,
    skippedTeams,
    skippedPlayers,
  };
}

async function writeRows(rows) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const supportedColumns = await detectSquadsColumns(db);
  const hasSourceColumn = supportedColumns.has("source");
  console.log(`[squads] detected columns: ${[...supportedColumns].join(", ")}`);

  let deleteQuery = db.from("squads").delete();
  if (hasSourceColumn) {
    deleteQuery = deleteQuery.or(`source.eq.${SOURCE},and(match_id.is.null,status.eq.squad)`);
  } else {
    deleteQuery = deleteQuery.is("match_id", null).eq("status", "squad");
  }

  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) throw new Error(`delete prior squads failed: ${deleteErr.message}`);

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((row) => filterSupportedColumns(row, supportedColumns));
    const { error } = await db.from("squads").insert(batch);
    if (error) throw new Error(`insert squads failed at ${i}: ${error.message}`);
    console.log(`[squads] inserted ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

async function detectSquadsColumns(db) {
  const fullColumns = [
    "match_id",
    "team_id",
    "player_name",
    "position",
    "status",
    "shirt_number",
    "club",
    "date_of_birth",
    "nationality",
    "source",
    "source_ids",
    "updated_at",
  ];
  const { error } = await db.from("squads").select(fullColumns.join(", ")).limit(1);
  if (!error) return new Set(fullColumns);

  console.warn(`[squads] enrichment columns unavailable, falling back to base schema: ${error.message}`);
  return new Set(["match_id", "team_id", "player_name", "position", "status"]);
}

function filterSupportedColumns(row, supportedColumns) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => supportedColumns.has(key)));
}

const sql = await fetchDumpSql();
const result = buildRows(sql);

console.log(
  JSON.stringify(
    {
      mode: write ? "write" : "dry-run",
      source: SOURCE,
      teamsWithFootballDataId: result.teamCount,
      importedRows: result.rows.length,
      availableRows: result.fullCount,
      skippedTeams: result.skippedTeams.length,
      skippedPlayers: result.skippedPlayers.length,
      sample: result.rows.slice(0, 5),
    },
    null,
    2,
  ),
);

if (write) {
  await writeRows(result.rows);
  console.log(`[squads] done: wrote ${result.rows.length} rows`);
} else {
  console.log("[squads] dry-run only. Re-run with --write to update Supabase.");
}
