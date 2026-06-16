import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { activeTier } from "@/lib/subscriptions";
import { chatJSONWith } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 45;

interface WeatherData {
  temp_c: number;
  feels_like_c: number;
  condition: string;
  humidity: number;
  wind_kph: number;
  wind_dir: string;
  icon: string;
}

interface IntelPayload {
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  weather: WeatherData | null;
  injuries_home: { player: string; status: string; note: string }[] | null;
  injuries_away: { player: string; status: string; note: string }[] | null;
  tactical_notes: string | null;
  key_absences: string | null;
  generated_at: string;
}

async function fetchWeather(city: string): Promise<WeatherData | null> {
  try {
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      { next: { revalidate: 3600 }, headers: { "User-Agent": "球译/1.0" } },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const cur = j?.current_condition?.[0];
    if (!cur) return null;
    return {
      temp_c: Number(cur.temp_C),
      feels_like_c: Number(cur.FeelsLikeC),
      condition: cur.weatherDesc?.[0]?.value ?? "",
      humidity: Number(cur.humidity),
      wind_kph: Number(cur.windspeedKmph),
      wind_dir: cur.winddir16Point ?? "",
      icon: cur.weatherIconUrl?.[0]?.value ?? "",
    };
  } catch {
    return null;
  }
}

async function generateIntel(opts: {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venueName: string | null;
  venueCity: string | null;
}): Promise<Omit<IntelPayload, "venue_name" | "venue_city" | "venue_country" | "weather" | "generated_at">> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { injuries_home: null, injuries_away: null, tactical_notes: null, key_absences: null };

  const systemPrompt = `你是世界杯专项分析助手，熟悉2026年世界杯参赛球队的最新阵容动态。
用户会给你一场比赛信息，请根据你的知识（截止训练数据）返回JSON：
{
  "injuries_home": [{"player":"球员名","status":"缺阵/疑问/伤愈复出","note":"具体情况"},...],
  "injuries_away": [...same...],
  "tactical_notes": "两队战术分析，重点是临场布阵变化，100-150字",
  "key_absences": "核心缺阵球员一句话总结，如无则null"
}
伤病信息务必谨慎，不确定的不要编造，可留空数组。输出中文。`;

  const userPrompt = `比赛：${opts.homeTeam} vs ${opts.awayTeam}
开赛时间（UTC）：${opts.kickoffAt}
场地：${opts.venueName ?? "未知"}，${opts.venueCity ?? "未知"}
请提供赛前已知的伤停情况与战术分析。`;

  try {
    const raw = await chatJSONWith({
      base: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      key,
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 800,
      label: "intel-gen",
    });
    const parsed = JSON.parse(raw);
    return {
      injuries_home: parsed.injuries_home ?? null,
      injuries_away: parsed.injuries_away ?? null,
      tactical_notes: parsed.tactical_notes ?? null,
      key_absences: parsed.key_absences ?? null,
    };
  } catch {
    return { injuries_home: null, injuries_away: null, tactical_notes: null, key_absences: null };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // 校验设备 ID 与 Max 档位
  const deviceId = req.nextUrl.searchParams.get("deviceId") ?? "";
  if (deviceId) {
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from("profiles")
      .select("sub_type, sub_expires")
      .eq("id", deviceId)
      .maybeSingle();
    const tier = activeTier(
      (profile?.sub_type as string | null) ?? null,
      (profile?.sub_expires as string | null) ?? null,
    );
    if (tier !== "max") {
      return NextResponse.json({ error: "max_required" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "max_required" }, { status: 403 });
  }

  const db = supabaseAdmin();

  // 读取比赛基本信息
  const { data: match } = await db
    .from("matches")
    .select(
      "id, kickoff_at, venue_name, venue_city, venue_country, home:teams!matches_home_team_id_fkey(name_zh), away:teams!matches_away_team_id_fkey(name_zh)",
    )
    .eq("id", matchId)
    .single();

  if (!match) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 检查缓存（12小时内有效）
  const { data: cached } = await db
    .from("match_intel")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  const cacheAge = cached?.generated_at
    ? Date.now() - new Date(cached.generated_at).getTime()
    : Infinity;
  const cacheValid = cacheAge < 12 * 3600_000;

  const venueCity = (match.venue_city as string | null) ?? null;
  const venueName = (match.venue_name as string | null) ?? null;

  // 天气实时拉取（缓存1小时由 fetch revalidate 控制）
  const weather = venueCity ? await fetchWeather(venueCity) : null;

  let intelFields: Omit<IntelPayload, "venue_name" | "venue_city" | "venue_country" | "weather" | "generated_at">;

  if (cacheValid && cached) {
    intelFields = {
      injuries_home: cached.injuries_home ?? null,
      injuries_away: cached.injuries_away ?? null,
      tactical_notes: cached.tactical_notes ?? null,
      key_absences: cached.key_absences ?? null,
    };
  } else {
    // 解析队名（处理 join 返回的数组或对象）
    const homeArr = match.home as unknown as { name_zh: string }[] | { name_zh: string } | null;
    const awayArr = match.away as unknown as { name_zh: string }[] | { name_zh: string } | null;
    const homeTeam = (Array.isArray(homeArr) ? homeArr[0]?.name_zh : homeArr?.name_zh) ?? "主队";
    const awayTeam = (Array.isArray(awayArr) ? awayArr[0]?.name_zh : awayArr?.name_zh) ?? "客队";

    intelFields = await generateIntel({
      matchId,
      homeTeam,
      awayTeam,
      kickoffAt: match.kickoff_at as string,
      venueName,
      venueCity,
    });

    // 写入/更新缓存
    await db.from("match_intel").upsert({
      match_id: matchId,
      ...intelFields,
      generated_at: new Date().toISOString(),
    });
  }

  const payload: IntelPayload = {
    venue_name: venueName,
    venue_city: venueCity,
    venue_country: (match.venue_country as string | null) ?? null,
    weather,
    ...intelFields,
    generated_at: cached?.generated_at ?? new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
