"use client";

import { useMemo, useState, useCallback } from "react";
import { DISCLAIMER, mOfNTotalOdds } from "@/lib/odds";
import type {
  SportteryMatch,
  SportteryOddsPayload,
  SportteryOddsRow,
  SportteryOutcome,
} from "@/lib/sporttery-types";

interface Selection {
  key: string;
  matchId: number;
  matchNum: string;
  matchLabel: string;
  poolName: string;
  handicapLabel: string;
  outcomeLabel: string;
  odd: number;
  probability: number;
}

const dayFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function selectionKey(match: SportteryMatch, row: SportteryOddsRow, outcome: SportteryOutcome) {
  return `${match.matchId}:${row.poolCode}:${outcome.key}`;
}

function formatBusinessDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  return dayFmt.format(date);
}

function probabilityAtLeast(probabilities: number[], target: number): number {
  const dp = new Array(probabilities.length + 1).fill(0);
  dp[0] = 1;
  for (const probability of probabilities) {
    for (let i = probabilities.length; i >= 0; i--) {
      dp[i] = dp[i] * (1 - probability) + (i > 0 ? dp[i - 1] * probability : 0);
    }
  }
  return dp.slice(target).reduce((sum, value) => sum + value, 0);
}

function OutcomeBtn({
  outcome, row, match, selections, onToggle,
}: {
  outcome: SportteryOutcome;
  row: SportteryOddsRow;
  match: SportteryMatch;
  selections: Map<string, Selection>;
  onToggle: (match: SportteryMatch, row: SportteryOddsRow, outcome: SportteryOutcome) => void;
  compact?: boolean;
}) {
  const key = selectionKey(match, row, outcome);
  const selected = selections.has(key);
  const disabled = outcome.odd === null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(match, row, outcome)}
      className={`block rounded-lg border px-1 py-2 text-center transition sm:min-h-0 sm:min-w-0 ${
        selected
          ? "border-neon bg-neon/10 shadow-[0_0_8px_rgba(12,157,104,0.15)]"
          : disabled
            ? "border-line/50 bg-surface text-faint/40"
            : "border-line bg-raised hover:border-neon/50"
      }`}
      aria-pressed={selected}
    >
      <span className={`block text-[11px] font-medium leading-none ${selected ? "text-neon" : "text-mut"}`}>{outcome.label}</span>
      <span className={`font-num mt-1 block text-sm font-bold tabular-nums leading-none ${selected ? "text-neon" : "text-amber"}`}>
        {outcome.odd?.toFixed(2) ?? "--"}
      </span>
      <span className={`font-num mt-0.5 block text-[10px] tabular-nums leading-none ${selected ? "text-neon/80" : "text-neon/60"}`}>
        {pct(outcome.probability)}
      </span>
    </button>
  );
}

function MatchOdds({
  match,
  selections,
  onToggle,
}: {
  match: SportteryMatch;
  selections: Map<string, Selection>;
  onToggle: (match: SportteryMatch, row: SportteryOddsRow, outcome: SportteryOutcome) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(v => !v), []);

  // 主要行：优先 HAD，其次 HHAD
  const hadRow = match.rows.find(r => r.poolCode === "HAD") ?? match.rows.find(r => r.poolCode === "HHAD");
  // 次要行：其余（不是主行的）
  const extraRows = match.rows.filter(r => r.poolCode !== hadRow?.poolCode);
  // HAD 中的平局结果
  const drawOutcome = hadRow?.outcomes.find(o => o.key === "D" || o.label === "平");
  // HAD 中胜/负
  const mainOutcomes = hadRow?.outcomes.filter(o => o.key !== "D" && o.label !== "平") ?? [];

  return (
    <article className="border-t border-line">
      <div className="grid grid-cols-[5rem_1fr] gap-3 px-4 py-4 sm:grid-cols-[6.5rem_1fr]">
        <div>
          <div className="text-xs font-medium text-mut">{match.league}</div>
          <div className="mt-2 rounded-lg bg-raised px-2 py-3 text-center">
            <div className="font-num text-sm font-semibold text-ink">{match.matchNum}</div>
            <div className="font-num mt-1 text-xs tabular-nums text-faint">
              {match.matchDate.slice(5)} {match.matchTime.slice(0, 5)}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-center">
            <span className="text-base font-semibold text-ink">{match.home}</span>
            {match.homeScore != null && match.awayScore != null ? (
              <span className="font-num mx-2 text-xl font-bold tabular-nums text-live">
                {match.homeScore}–{match.awayScore}
              </span>
            ) : (
              <span className="px-2 text-faint">VS</span>
            )}
            <span className="text-base font-semibold text-ink">{match.away}</span>
          </div>

          {/* 胜平负三格统一展示 */}
          {hadRow && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-mut">{hadRow.poolName}</span>
                {extraRows.length > 0 && (
                  <button
                    onClick={toggle}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                      expanded ? "bg-line text-mut hover:text-ink" : "bg-neon/10 text-neon hover:bg-neon/20"
                    }`}
                  >
                    {expanded ? "收起 ▴" : "更多玩法 ▾"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {hadRow.outcomes.map(o => (
                  <OutcomeBtn key={o.key} outcome={o} row={hadRow} match={match} selections={selections} onToggle={onToggle} />
                ))}
              </div>
            </div>
          )}

          {/* 展开：其余玩法 */}
          {expanded && extraRows.map((row) => {
            const isTTG = row.poolCode === "TTG";
            const isMNTS = row.poolCode === "MNTS";
            const isHHAD = row.poolCode === "HHAD";
            const isCRS = row.poolCode === "CRS" || row.poolCode === "CSO";
            // 比分玩法：按主场得分分组，列出所有比分组合
            if (isCRS) {
              // 只展示有赔率的比分，按主场进球数分组
              const scoreGroups = new Map<number, typeof row.outcomes>();
              for (const o of row.outcomes) {
                if (o.odd === null) continue;
                const m = o.key.match(/^s(\d{2})s(\d{2})/);
                const home = m ? Number(m[1]) : -1;
                const list = scoreGroups.get(home) ?? [];
                list.push(o);
                scoreGroups.set(home, list);
              }
              if (scoreGroups.size === 0) return null;
              const sortedGroups = [...scoreGroups.entries()].sort(([a], [b]) => a - b);
              return (
                <div key={row.poolCode} className="mt-3">
                  <div className="mb-2 text-xs font-medium text-mut">{row.poolName}</div>
                  <div className="space-y-1.5">
                    {sortedGroups.map(([homeGoals, outcomes]) => (
                      <div key={homeGoals} className="flex items-center gap-2">
                        <div className="w-8 shrink-0 text-center">
                          <span className="font-num text-[10px] leading-tight text-faint">
                            主{homeGoals}球
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {outcomes.map(o => {
                            const selKey = selectionKey(match, row, o);
                            const sel = selections.has(selKey);
                            return (
                              <button
                                key={o.key}
                                type="button"
                                onClick={() => onToggle(match, row, o)}
                                aria-pressed={sel}
                                className={`block rounded-md border px-2 py-1 text-center transition sm:min-h-0 sm:min-w-0 ${
                                  sel
                                    ? "border-neon bg-neon/10 shadow-[0_0_8px_rgba(12,157,104,0.15)]"
                                    : "border-line bg-raised hover:border-neon/40"
                                }`}
                              >
                                <span className={`block text-[10px] leading-none ${sel ? "text-neon" : "text-mut"}`}>{o.label}</span>
                                <span className={`font-num block text-sm font-bold leading-snug tabular-nums ${sel ? "text-neon" : "text-amber"}`}>
                                  {o.odd?.toFixed(2) ?? "--"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            // 非比分玩法：过滤掉无赔率的选项
            const validOutcomes = row.outcomes.filter(o => o.odd !== null);
            if (validOutcomes.length === 0) return null;
            return (
              <div key={row.poolCode} className="mt-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-mut">{row.poolName}</span>
                  {isHHAD && row.handicapLabel && row.handicapLabel !== "0" && (
                    <span className="font-num text-xs font-semibold text-amber">[{row.handicapLabel}]</span>
                  )}
                </div>
                <div className={`grid gap-1.5 ${isTTG ? "grid-cols-4" : "grid-cols-3"}`}>
                  {validOutcomes.map(o => (
                    <OutcomeBtn key={o.key} outcome={o} row={row} match={match} selections={selections} onToggle={onToggle} compact={isTTG || isMNTS} />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-2 flex items-center justify-between text-xs text-faint">
            <span>{match.status === "Selling" ? "官方在售赔率" : match.status || "官方赔率"}</span>
            <span className="font-num">
              {match.rows[0]?.updateAt ? `更新 ${match.rows[0].updateAt}` : ""}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function SportteryOddsBoard({
  payload,
  embedded = false,
}: {
  payload: SportteryOddsPayload;
  embedded?: boolean;
}) {
  const [selections, setSelections] = useState<Map<string, Selection>>(new Map());
  const [multiple, setMultiple] = useState(1);
  const [passM, setPassM] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const selected = useMemo(() => [...selections.values()], [selections]);
  const grouped = useMemo(() => {
    const map = new Map<number, Selection[]>();
    for (const item of selected) {
      const list = map.get(item.matchId) ?? [];
      list.push(item);
      map.set(item.matchId, list);
    }
    return [...map.values()];
  }, [selected]);

  const selectedMatchCount = grouped.length;
  const passOptions =
    selectedMatchCount === 0
      ? []
      : selectedMatchCount === 1
        ? [1]
        : Array.from({ length: Math.min(selectedMatchCount, 8) - 1 }, (_, i) => i + 2);
  const effectivePass = passOptions.includes(passM ?? 0)
    ? (passM as number)
    : (passOptions.at(-1) ?? 1);

  const optionCounts = grouped.map((items) => items.length);
  const maxOdds = grouped.map((items) => Math.max(...items.map((item) => item.odd)));
  const coverProbabilities = grouped.map((items) =>
    Math.min(
      1,
      items.reduce((sum, item) => sum + item.probability, 0),
    ),
  );

  const ticketCount =
    selectedMatchCount > 0 ? Math.round(mOfNTotalOdds(optionCounts, effectivePass)) : 0;
  const simulatedAmount = ticketCount * 2 * multiple;
  const maxReturn =
    selectedMatchCount > 0 ? mOfNTotalOdds(maxOdds, effectivePass) * 2 * multiple : 0;
  const hitProbability =
    selectedMatchCount > 0 ? probabilityAtLeast(coverProbabilities, effectivePass) : 0;

  const toggle = (match: SportteryMatch, row: SportteryOddsRow, outcome: SportteryOutcome) => {
    if (outcome.odd === null) return;
    const key = selectionKey(match, row, outcome);
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          key,
          matchId: match.matchId,
          matchNum: match.matchNum,
          matchLabel: `${match.home} VS ${match.away}`,
          poolName: row.poolName,
          handicapLabel: row.handicapLabel,
          outcomeLabel: outcome.label,
          odd: outcome.odd!,
          probability: outcome.probability ?? 0,
        });
      }
      return next;
    });
  };

  return (
    <div className="pb-64">
      <main className="mx-auto max-w-4xl">
        <section className="card px-5 py-4">
          <h2 className="text-lg font-bold text-ink">体彩官方赔率</h2>
          <p className="mt-1 text-sm leading-relaxed text-mut">
            在售赔率自动同步，页面持续展示最新采集结果。点击任意结果即可组合串关，
            百分比为赔率反推的归一化概率，仅作信息换算。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip text-neon">实时同步赔率</span>
            <span className="chip font-num">每 10 分钟更新 · {payload.lastUpdated ?? "同步中"}</span>
          </div>
          {payload.error && (
            <p className="mt-3 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber/80">
              {payload.error}
            </p>
          )}
        </section>

        {payload.days.length === 0 ? (
          <div className="card mt-3 border-dashed px-4 py-12 text-center text-sm text-mut">
            暂时没有读取到官方赔率。可以稍后刷新，或检查官方计算器页面是否正常开放。
          </div>
        ) : (
          payload.days.map((day) => {
            const wcMatches = day.matches.filter(m => m.league.includes("世界杯"));
            if (wcMatches.length === 0) return null;
            return (
              <section key={day.businessDate} className="card mt-3 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm font-medium text-ink">
                    {formatBusinessDate(day.businessDate)}
                    <span className="ml-2 font-normal text-faint">共{wcMatches.length}场世界杯</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs text-neon">
                    <span className="anim-pulse-dot h-2 w-2 rounded-full bg-neon" />
                    赔率已同步
                  </span>
                </div>
                {wcMatches.map((match) => (
                  <MatchOdds
                    key={match.matchId}
                    match={match}
                    selections={selections}
                    onToggle={toggle}
                  />
                ))}
              </section>
            );
          })
        )}

        <p className="mt-4 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber/80">
          {DISCLAIMER}
          本页仅展示官方公开赔率并提供模拟金额与概率换算，不提供下单、出票、代购或任何购彩建议。
        </p>
      </main>

      {/* 底部模拟单 */}
      <aside
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 shadow-[0_-8px_24px_rgba(24,36,32,0.08)] backdrop-blur"
      >
        {showDetails && selected.length > 0 && (
          <div className="mx-auto max-h-40 max-w-4xl overflow-auto border-b border-line px-4 py-3 text-sm">
            <div className="mb-2 font-medium text-ink">已选明细</div>
            <div className="space-y-1">
              {selected.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-mut">
                    {item.matchNum} {item.matchLabel} · {item.poolName}[{item.handicapLabel}] ·{" "}
                    {item.outcomeLabel}
                  </span>
                  <span className="font-num shrink-0 tabular-nums text-amber">
                    {item.odd.toFixed(2)} / {pct(item.probability)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto grid max-w-4xl grid-cols-[5rem_1fr_4.5rem] gap-3 px-4 py-3 sm:grid-cols-[6.5rem_1fr_6.5rem]">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="relative rounded-lg border border-line py-3 text-sm text-ink"
          >
            <span className="font-num absolute -left-2.5 -top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-neon text-base font-bold text-pitch">
              {selected.length}
            </span>
            已选
          </button>

          <label className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm text-mut">
            过关选择
            <select
              value={effectivePass}
              disabled={passOptions.length === 0}
              onChange={(event) => setPassM(Number(event.target.value))}
              className="rounded-md border border-line bg-raised px-2 py-1 text-neon outline-none disabled:text-faint"
            >
              {passOptions.length === 0 ? (
                <option value={1}>请选择</option>
              ) : (
                passOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 1 ? "单关" : `${option}串1`}
                  </option>
                ))
              )}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setSelections(new Map())}
            className="rounded-lg border border-line py-3 text-sm text-mut disabled:text-faint/50"
            disabled={selected.length === 0}
          >
            清空
          </button>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-[5rem_1fr_6rem] gap-3 px-4 pb-4 sm:grid-cols-[6.5rem_1fr_7rem]">
          <label className="rounded-lg border border-line px-2 py-2 text-center text-sm text-mut">
            <input
              value={multiple}
              min={1}
              max={50}
              inputMode="numeric"
              onChange={(event) => {
                const next = Math.max(1, Math.min(50, Number(event.target.value) || 1));
                setMultiple(next);
              }}
              className="font-num w-10 bg-transparent text-center text-lg font-semibold text-neon outline-none"
            />
            倍
          </label>

          <div className="grid content-center gap-1 text-sm text-mut">
            <div>
              模拟金额：
              <span className="font-num font-semibold tabular-nums text-amber">
                {money(simulatedAmount)}
              </span>
              元
              <span className="font-num ml-2 text-xs text-faint">每注2元 · {ticketCount}注</span>
            </div>
            <div>
              理论最高金额：
              <span className="font-num font-semibold tabular-nums text-amber">
                {money(maxReturn)}
              </span>
              元
            </div>
            <div>
              命中≥{effectivePass}场概率估算：
              <span className="font-num font-semibold tabular-nums text-neon">
                {pct(hitProbability)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="rounded-lg bg-neon px-2 py-3 text-sm font-semibold text-pitch transition hover:brightness-110 disabled:bg-raised disabled:text-faint"
            disabled={selected.length === 0}
          >
            查看明细
          </button>
        </div>
      </aside>
    </div>
  );
}
