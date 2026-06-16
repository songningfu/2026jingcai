"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface GTeam {
  id: number;
  name: string;
  group: string | null;
  logo: string | null;
  players: number;
  avgAge: number | null;
}
interface GMatch {
  id: number;
  homeId: number;
  awayId: number;
  kickoff: string;
  status: string;
  stage: string;
  group: string | null;
  homeScore: number | null;
  awayScore: number | null;
}
interface GraphData {
  groups: string[];
  teams: GTeam[];
  matches: GMatch[];
}

type NodeKind = "group" | "team" | "match";
interface SimNode {
  key: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ax?: number;
  ay?: number;
  team?: GTeam;
  match?: GMatch;
  group?: string;
}
interface SimEdge {
  s: number;
  t: number;
  kind: "belong" | "home" | "away";
  rest: number;
}

const DEFAULT_W = 960;
const DEFAULT_H = 600;

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const STAGE_ZH: Record<string, string> = {
  group: "小组赛",
  round32: "1/16 决赛",
  round16: "1/8 决赛",
  quarter: "1/4 决赛",
  semi: "半决赛",
  third: "季军赛",
  final: "决赛",
};

interface TournamentGraphProps {
  onMatchSelect?: (matchId: number) => void;
  highlightMatchId?: number | null;
  highlightTeamIds?: number[];
  autoFocusGroup?: string | null;
  isAnalyzing?: boolean;
}

export default function TournamentGraph({ onMatchSelect, highlightMatchId, highlightTeamIds, autoFocusGroup, isAnalyzing = false }: TournamentGraphProps = {}) {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  const [focusGroup, setFocusGroup] = useState<string>("");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [, setFrame] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const dragRef = useRef<SimNode | null>(null);
  const posCache = useRef(new Map<string, { x: number; y: number }>());
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const dimRef = useRef({ w: DEFAULT_W, h: DEFAULT_H });
  const [svgDim, setSvgDim] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 10 && height > 10) {
        dimRef.current = { w: Math.round(width), h: Math.round(height) };
        setSvgDim({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // re-run once data has loaded so containerRef is actually mounted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  // 分析中：每隔 1.8s 重新激活力模拟，让节点持续涌动
  useEffect(() => {
    if (!isAnalyzing) return;
    const id = setInterval(() => {
      alphaRef.current = Math.max(alphaRef.current, 0.55);
    }, 1800);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  useEffect(() => {
    fetch("/api/deduction/graph")
      .then((r) => r.json())
      .then((d) => (d.ok ? setData(d) : setError(d.error ?? "图谱数据加载失败")))
      .catch(() => setError("图谱数据加载失败"));
  }, []);

  // 外部传入 autoFocusGroup 时同步内部状态
  useEffect(() => {
    if (autoFocusGroup !== undefined) {
      setFocusGroup(autoFocusGroup ?? "");
      setSelectedKey(null);
    }
  }, [autoFocusGroup]);

  useEffect(() => {
    if (!data) return;
    const CW = dimRef.current.w;
    const CH = dimRef.current.h;
    const groups = focusGroup ? [focusGroup] : data.groups;
    const teams = data.teams.filter((t) => !focusGroup || t.group === focusGroup);
    const teamIds = new Set(teams.map((t) => t.id));
    const matches = data.matches.filter((m) => teamIds.has(m.homeId) && teamIds.has(m.awayId));

    const nodes: SimNode[] = [];
    const index = new Map<string, number>();
    const push = (n: SimNode) => {
      const cached = posCache.current.get(n.key);
      if (cached) { n.x = cached.x; n.y = cached.y; }
      index.set(n.key, nodes.length);
      nodes.push(n);
    };

    groups.forEach((g, i) => {
      const angle = (i / groups.length) * Math.PI * 2 - Math.PI / 2;
      const ax = CW / 2 + Math.cos(angle) * (focusGroup ? 0 : CW * 0.33);
      const ay = CH / 2 + Math.sin(angle) * (focusGroup ? 0 : CH * 0.32);
      push({
        key: `g:${g}`, kind: "group", label: `${g}组`,
        x: ax + (Math.random() - 0.5) * 10, y: ay + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0, r: focusGroup ? 18 : 13, ax, ay, group: g,
      });
    });

    teams.forEach((t) => {
      const gi = t.group ? index.get(`g:${t.group}`) : undefined;
      const gx = gi !== undefined ? nodes[gi].x : CW / 2;
      const gy = gi !== undefined ? nodes[gi].y : CH / 2;
      push({
        key: `t:${t.id}`, kind: "team", label: t.name,
        x: gx + (Math.random() - 0.5) * 90, y: gy + (Math.random() - 0.5) * 90,
        vx: 0, vy: 0, r: focusGroup ? 11 : 8, team: t, group: t.group ?? undefined,
      });
    });

    matches.forEach((m) => {
      const hi = index.get(`t:${m.homeId}`);
      const ai = index.get(`t:${m.awayId}`);
      if (hi === undefined || ai === undefined) return;
      push({
        key: `m:${m.id}`, kind: "match",
        label: m.status === "finished" ? `${m.homeScore}-${m.awayScore}` : timeFmt.format(new Date(m.kickoff)),
        x: (nodes[hi].x + nodes[ai].x) / 2 + (Math.random() - 0.5) * 30,
        y: (nodes[hi].y + nodes[ai].y) / 2 + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0, r: focusGroup ? 6.5 : 4.5, match: m, group: m.group ?? undefined,
      });
    });

    const edges: SimEdge[] = [];
    teams.forEach((t) => {
      if (t.group && index.has(`g:${t.group}`) && index.has(`t:${t.id}`)) {
        edges.push({ s: index.get(`t:${t.id}`)!, t: index.get(`g:${t.group}`)!, kind: "belong", rest: focusGroup ? 130 : 62 });
      }
    });
    matches.forEach((m) => {
      const mi = index.get(`m:${m.id}`);
      const hi = index.get(`t:${m.homeId}`);
      const ai = index.get(`t:${m.awayId}`);
      if (mi === undefined || hi === undefined || ai === undefined) return;
      edges.push({ s: mi, t: hi, kind: "home", rest: focusGroup ? 80 : 46 });
      edges.push({ s: mi, t: ai, kind: "away", rest: focusGroup ? 80 : 46 });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
    alphaRef.current = 1;
  }, [data, focusGroup]);

  useEffect(() => {
    const step = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const alpha = alphaRef.current;
      if (nodes.length && alpha > 0.012) {
        for (let iter = 0; iter < 2; iter++) {
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i], b = nodes[j];
              let dx = a.x - b.x, dy = a.y - b.y;
              let d2 = dx * dx + dy * dy;
              if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
              if (d2 > 36000) continue;
              const f = (a.kind === "team" && b.kind === "team" ? 900 : 520) / d2;
              const fx = dx * f, fy = dy * f;
              a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
            }
          }
          for (const e of edges) {
            const a = nodes[e.s], b = nodes[e.t];
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = ((d - e.rest) / d) * 0.055;
            a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
          }
          const CW = dimRef.current.w;
          const CH = dimRef.current.h;
          for (const n of nodes) {
            if (n.ax !== undefined && n.ay !== undefined) {
              n.vx += (n.ax - n.x) * 0.05;
              n.vy += (n.ay - n.y) * 0.05;
            } else {
              n.vx += (CW / 2 - n.x) * 0.0035;
              n.vy += (CH / 2 - n.y) * 0.0035;
            }
            if (dragRef.current === n) { n.vx = 0; n.vy = 0; continue; }
            n.vx *= 0.82; n.vy *= 0.82;
            const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
            if (sp > 14) { n.vx = (n.vx / sp) * 14; n.vy = (n.vy / sp) * 14; }
            // 虚拟画布是可视区域的 3 倍，节点可自由分布，用户通过 pan 浏览
            const VW = CW * 1.5, VH = CH * 1.5;
            n.x = Math.max(-VW, Math.min(CW + VW, n.x + n.vx * alpha));
            n.y = Math.max(-VH, Math.min(CH + VH, n.y + n.vy * alpha));
          }
        }
        alphaRef.current *= 0.985;
        for (const n of nodesRef.current) posCache.current.set(n.key, { x: n.x, y: n.y });
        setFrame((f) => f + 1);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toSvgXY = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const { w, h } = dimRef.current;
    return {
      x: ((clientX - rect.left) / rect.width) * w - panOffsetRef.current.x,
      y: ((clientY - rect.top) / rect.height) * h - panOffsetRef.current.y,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (panRef.current && !dragRef.current) {
      const rect = svgRef.current!.getBoundingClientRect();
      const { w, h } = dimRef.current;
      const dx = ((e.clientX - panRef.current.startX) / rect.width) * w;
      const dy = ((e.clientY - panRef.current.startY) / rect.height) * h;
      const nx = panRef.current.ox + dx;
      const ny = panRef.current.oy + dy;
      panOffsetRef.current = { x: nx, y: ny };
      setPanOffset({ x: nx, y: ny });
      return;
    }
    if (!dragRef.current) return;
    const { x, y } = toSvgXY(e.clientX, e.clientY);
    const { w, h } = dimRef.current;
    dragRef.current.x = Math.max(34, Math.min(w - 34, x));
    dragRef.current.y = Math.max(30, Math.min(h - 30, y));
    alphaRef.current = Math.max(alphaRef.current, 0.25);
    setFrame((f) => f + 1);
  }, [toSvgXY]);

  const endDrag = useCallback(() => { dragRef.current = null; panRef.current = null; }, []);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const nodes = nodesRef.current;
    for (const e of edgesRef.current) {
      const a = nodes[e.s]?.key, b = nodes[e.t]?.key;
      if (!a || !b) continue;
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, focusGroup, nodesRef.current.length]);

  const activeKey = hoverKey ?? selectedKey;
  const isDim = (key: string) => !!activeKey && key !== activeKey && !neighbors.get(activeKey)?.has(key);

  const selected = nodesRef.current.find((n) => n.key === selectedKey) ?? null;
  const teamMatches = useMemo(() => {
    if (!selected?.team || !data) return [];
    return data.matches.filter((m) => m.homeId === selected.team!.id || m.awayId === selected.team!.id).slice(0, 6);
  }, [selected, data]);
  const teamName = useCallback((id: number) => data?.teams.find((t) => t.id === id)?.name ?? "待定", [data]);

  if (error) return <div className="card h-full px-6 py-10 text-center text-sm text-faint">{error}</div>;
  if (!data) return (
    <div className="card flex h-full items-center justify-center gap-2 text-sm text-faint">
      <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-neon" />
      加载图谱中…
    </div>
  );

  const nodes = nodesRef.current;
  const edges = edgesRef.current;

  return (
    <div className="card relative flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-mut">
          <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-neon" />
          赛事关系图谱
          <span className="font-num hidden text-faint sm:inline">
            {nodes.length} 节点 · {edges.length} 关系
          </span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={focusGroup}
            onChange={(e) => { setFocusGroup(e.target.value); setSelectedKey(null); }}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-mut outline-none"
            aria-label="小组聚焦"
          >
            <option value="">全部小组</option>
            {data.groups.map((g) => <option key={g} value={g}>{g}组</option>)}
          </select>
          {(focusGroup || selectedKey) && (
            <button onClick={() => { setFocusGroup(""); setSelectedKey(null); }} className="rounded-full bg-raised px-2.5 py-1 text-xs text-mut hover:text-ink">
              重置
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden min-h-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgDim.w} ${svgDim.h}`}
          className="block h-full w-full select-none"
          style={{ touchAction: "none", cursor: panRef.current ? "grabbing" : "grab" }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerDown={(e) => {
            if (dragRef.current) return;
            panRef.current = { startX: e.clientX, startY: e.clientY, ox: panOffsetRef.current.x, oy: panOffsetRef.current.y };
          }}
          onClick={() => setSelectedKey(null)}
        >
          <defs>
            <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.2" cy="1.2" r="1.2" fill="var(--color-line)" />
            </pattern>
          </defs>
          <rect width={svgDim.w} height={svgDim.h} fill="url(#dotgrid)" />
          <g transform={`translate(${panOffset.x},${panOffset.y})`}>

          {edges.map((e, i) => {
            const a = nodes[e.s], b = nodes[e.t];
            if (!a || !b) return null;
            const dim = isDim(a.key) || isDim(b.key);
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--color-line-strong)"
                strokeWidth={e.kind === "belong" ? 1.1 : 0.8}
                opacity={dim ? 0.1 : 0.5}
              />
            );
          })}

          {nodes.map((n) => {
            const dim = isDim(n.key);
            const sel = n.key === selectedKey;
            const live = n.match?.status === "live";
            const finished = n.match?.status === "finished";
            return (
              <g
                key={n.key}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.15 : 1}
                className="cursor-pointer"
                onPointerDown={(e) => { e.stopPropagation(); dragRef.current = n; }}
                onPointerEnter={() => setHoverKey(n.key)}
                onPointerLeave={() => setHoverKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (n.kind === "group") {
                    setFocusGroup(focusGroup === n.group ? "" : (n.group ?? ""));
                    setSelectedKey(null);
                  } else if (n.kind === "match" && onMatchSelect) {
                    onMatchSelect(n.match!.id);
                  } else {
                    setSelectedKey(sel ? null : n.key);
                  }
                }}
              >
                {sel && <circle r={n.r + 5} fill="none" stroke="var(--color-neon)" strokeWidth={1.4} strokeDasharray="3 2" />}
                {n.kind === "group" && (
                  <>
                    <circle r={n.r} fill="var(--color-amber)" opacity={0.14} stroke="var(--color-amber)" strokeWidth={1.4} />
                    <text fontSize={n.r * 0.78} fill="var(--color-amber)" fontWeight={700} textAnchor="middle" dy={n.r * 0.28}>{n.group}</text>
                  </>
                )}
                {n.kind === "team" && (
                  <>
                    {highlightTeamIds?.includes(n.team?.id ?? -1) && (
                      <circle r={n.r + 5} fill="none" stroke="var(--color-amber)" strokeWidth={1.8} strokeDasharray="3 2" opacity={0.9} />
                    )}
                    <circle r={n.r}
                      fill={highlightTeamIds?.includes(n.team?.id ?? -1) ? "var(--color-amber)" : "var(--color-neon)"}
                      opacity={0.9}
                    />
                    <text fontSize={9} fill="var(--color-ink)" textAnchor="middle" dy={n.r + 10}>{n.label}</text>
                  </>
                )}
                {n.kind === "match" && (
                  <>
                    {highlightMatchId === n.match?.id && (
                      <circle r={n.r + 6} fill="none" stroke="var(--color-neon)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.8}>
                        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={n.r}
                      fill={live ? "var(--color-live)" : finished ? "var(--color-faint)" : highlightMatchId === n.match?.id ? "var(--color-neon)" : "var(--color-surface)"}
                      stroke={highlightMatchId === n.match?.id ? "var(--color-neon)" : live ? "var(--color-live)" : "var(--color-mut)"}
                      strokeWidth={highlightMatchId === n.match?.id ? 2 : 1}
                    >
                      {live && <animate attributeName="r" values={`${n.r};${n.r + 2};${n.r}`} dur="1.4s" repeatCount="indefinite" />}
                    </circle>
                    {(hoverKey === n.key || sel || finished) && (
                      <text fontSize={7.5} fill={finished ? "var(--color-mut)" : "var(--color-amber)"} textAnchor="middle" dy={-n.r - 3} className="font-num">
                        {n.label}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          </g>
        </svg>

        {/* AI 分析中扫描线效果 */}
        {isAnalyzing && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-neon to-transparent opacity-70"
              style={{ top: 0, animation: "scanline 2.2s linear infinite" }}
            />
            <div className="absolute inset-0 rounded-none bg-neon/[0.03]" />
          </div>
        )}

        <div className="absolute bottom-3 left-3 rounded-xl border border-line bg-surface/90 px-3.5 py-2.5 text-[11px] backdrop-blur">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-mut"><span className="h-2.5 w-2.5 rounded-full border border-amber bg-amber/20" />小组（点击聚焦）</span>
            <span className="flex items-center gap-1.5 text-mut"><span className="h-2.5 w-2.5 rounded-full bg-neon" />球队（点击看信息）</span>
            <span className="flex items-center gap-1.5 text-mut"><span className="h-2 w-2 rounded-full border border-mut bg-surface" />比赛（点击可推演）</span>
          </div>
        </div>

        {selected && (selected.team || selected.match) && (
          <div className="anim-fade-up absolute bottom-3 right-3 w-64 rounded-xl border border-line bg-surface/95 p-3.5 shadow-lg backdrop-blur">
            {selected.team && (
              <>
                <div className="flex items-center gap-2">
                  {selected.team.logo && <img src={selected.team.logo} alt="" className="h-6 w-6 object-contain" />}
                  <span className="font-semibold text-ink">{selected.team.name}</span>
                  {selected.team.group && <span className="chip !px-1.5 !text-[10px]">{selected.team.group}组</span>}
                </div>
                {selected.team.players > 0 && (
                  <p className="font-num mt-1.5 text-xs text-mut">
                    名单 {selected.team.players} 人{selected.team.avgAge ? ` · 平均 ${selected.team.avgAge} 岁` : ""}
                  </p>
                )}
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {teamMatches.map((m) => (
                    <Link key={m.id} href={`/match/${m.id}`} className="flex items-center justify-between text-xs text-mut transition hover:text-neon">
                      <span className="truncate">
                        {m.homeId === selected.team!.id ? `vs ${teamName(m.awayId)}` : `@ ${teamName(m.homeId)}`}
                      </span>
                      <span className="font-num shrink-0 text-faint">
                        {m.status === "finished" ? `${m.homeScore}-${m.awayScore}` : timeFmt.format(new Date(m.kickoff))}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {selected.match && (
              <>
                <p className="text-sm font-semibold text-ink">
                  {teamName(selected.match.homeId)} <span className="text-faint">vs</span> {teamName(selected.match.awayId)}
                </p>
                <p className="font-num mt-1 text-xs text-mut">
                  {STAGE_ZH[selected.match.stage] ?? selected.match.stage}
                  {selected.match.group ? ` · ${selected.match.group}组` : ""} · {timeFmt.format(new Date(selected.match.kickoff))}
                  {selected.match.status === "finished" && ` · 终场 ${selected.match.homeScore}-${selected.match.awayScore}`}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Link href={`/match/${selected.match.id}`} className="flex-1 rounded-lg border border-line py-1.5 text-center text-xs text-ink transition hover:border-neon/50">
                    比赛详情
                  </Link>
                  {selected.match.status !== "finished" && (
                    <Link href={`/match/${selected.match.id}#ai`} className="flex-1 rounded-lg bg-neon py-1.5 text-center text-xs font-semibold text-white transition hover:brightness-110">
                      去推演
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
