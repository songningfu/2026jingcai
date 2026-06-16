"use client";

import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device-id";

interface WeatherData {
  temp_c: number;
  feels_like_c: number;
  condition: string;
  humidity: number;
  wind_kph: number;
  wind_dir: string;
}

interface InjuryEntry {
  player: string;
  status: string;
  note: string;
}

interface IntelData {
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  weather: WeatherData | null;
  injuries_home: InjuryEntry[] | null;
  injuries_away: InjuryEntry[] | null;
  tactical_notes: string | null;
  key_absences: string | null;
  generated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  缺阵: "text-red-400",
  疑问: "text-amber-400",
  伤愈复出: "text-neon",
};

function WeatherCard({ w }: { w: WeatherData }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <div className="flex items-baseline gap-1">
        <span className="font-num text-2xl font-bold text-ink">{w.temp_c}°</span>
        <span className="text-xs text-faint">体感 {w.feels_like_c}°</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-mut">{w.condition}</span>
        <span className="text-xs text-faint">湿度 {w.humidity}% · 风速 {w.wind_kph} km/h {w.wind_dir}</span>
      </div>
    </div>
  );
}

function InjuryList({ list, teamName }: { list: InjuryEntry[]; teamName: string }) {
  if (list.length === 0) return <p className="text-xs text-faint">暂无已知伤停情况</p>;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-mut">{teamName}</p>
      <div className="space-y-1.5">
        {list.map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 font-medium ${STATUS_COLOR[e.status] ?? "text-mut"}`}>
              {e.status}
            </span>
            <span className="text-ink/90">{e.player}</span>
            {e.note && <span className="text-faint">— {e.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MaxIntelPanel({
  matchId,
  homeTeamName,
  awayTeamName,
}: {
  matchId: number;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const [state, setState] = useState<"loading" | "locked" | "done" | "error">("loading");
  const [data, setData] = useState<IntelData | null>(null);

  useEffect(() => {
    const deviceId = getDeviceId();
    fetch(`/api/match/${matchId}/intel?deviceId=${encodeURIComponent(deviceId)}`)
      .then(async (res) => {
        if (res.status === 403) { setState("locked"); return; }
        if (!res.ok) { setState("error"); return; }
        const d = await res.json();
        setData(d);
        setState("done");
      })
      .catch(() => setState("error"));
  }, [matchId]);

  return (
    <section className="card anim-fade-up overflow-hidden" style={{ animationDelay: "240ms" }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="h-3 w-1 rounded-full bg-amber" />
          临场情报
        </h2>
        <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber">
          MAX
        </span>
      </div>

      {/* 加载中 */}
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-faint">
          <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-amber" />
          正在获取临场情报…
        </div>
      )}

      {/* 未解锁（模糊遮罩） */}
      {state === "locked" && (
        <div className="relative select-none">
          {/* 模拟内容 */}
          <div className="space-y-4 px-5 py-4 blur-sm">
            <div className="h-4 w-3/4 rounded bg-raised" />
            <div className="h-4 w-1/2 rounded bg-raised" />
            <div className="h-4 w-2/3 rounded bg-raised" />
            <div className="h-4 w-1/3 rounded bg-raised" />
          </div>
          {/* 遮罩 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/60 backdrop-blur-sm">
            <span className="text-xs text-mut">天气 · 伤停 · 场地 · 战术情报</span>
            <span className="rounded-full bg-amber px-4 py-1.5 text-xs font-bold text-bg">
              MAX 专属
            </span>
          </div>
        </div>
      )}

      {/* 错误 */}
      {state === "error" && (
        <p className="px-5 py-6 text-xs text-faint">情报获取失败，请稍后刷新重试。</p>
      )}

      {/* 数据展示 */}
      {state === "done" && data && (
        <div className="divide-y divide-line">
          {/* 场地 + 天气 */}
          {(data.venue_name || data.weather) && (
            <div className="px-5 py-4 space-y-3">
              {data.venue_name && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="w-8 shrink-0 text-faint pt-0.5">场地</span>
                  <span className="text-mut leading-relaxed">
                    {data.venue_name}
                    {data.venue_city ? `，${data.venue_city}` : ""}
                    {data.venue_country ? `（${data.venue_country}）` : ""}
                  </span>
                </div>
              )}
              {data.weather && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="w-8 shrink-0 text-faint pt-1">天气</span>
                  <WeatherCard w={data.weather} />
                </div>
              )}
            </div>
          )}

          {/* 伤停 */}
          {(data.injuries_home || data.injuries_away) && (
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs font-semibold text-mut uppercase tracking-wider">伤停情况</p>
              {data.key_absences && (
                <p className="text-xs text-amber leading-relaxed">{data.key_absences}</p>
              )}
              {data.injuries_home && (
                <InjuryList list={data.injuries_home} teamName={homeTeamName} />
              )}
              {data.injuries_away && (
                <InjuryList list={data.injuries_away} teamName={awayTeamName} />
              )}
            </div>
          )}

          {/* 战术情报 */}
          {data.tactical_notes && (
            <div className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold text-mut uppercase tracking-wider">战术分析</p>
              <p className="text-xs leading-relaxed text-mut">{data.tactical_notes}</p>
            </div>
          )}

          {/* 更新时间 */}
          <div className="px-5 py-2.5">
            <p className="text-[10px] text-faint">
              情报更新于 {new Date(data.generated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}（北京时间）· 天气实时
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
