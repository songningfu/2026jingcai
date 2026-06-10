"use client";

import { useMemo, useState } from "react";
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

function MatchOdds({
  match,
  selections,
  onToggle,
}: {
  match: SportteryMatch;
  selections: Map<string, Selection>;
  onToggle: (match: SportteryMatch, row: SportteryOddsRow, outcome: SportteryOutcome) => void;
}) {
  return (
    <article className="border-t border-neutral-200 bg-white">
      <div className="grid grid-cols-[5.5rem_1fr] gap-2 px-3 py-3 sm:grid-cols-[7rem_1fr]">
        <div>
          <div className="text-sm font-medium text-neutral-700">{match.league}</div>
          <div className="mt-2 rounded-lg bg-neutral-50 px-2 py-3 text-center">
            <div className="text-sm text-neutral-600">{match.matchNum}</div>
            <div className="mt-1 text-sm tabular-nums text-neutral-500">
              {match.matchDate.slice(5)} {match.matchTime.slice(0, 5)}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 truncate text-center text-lg font-semibold text-neutral-900">
            {match.home} <span className="px-2 text-neutral-500">VS</span> {match.away}
          </div>
          <div className="space-y-2">
            {match.rows.map((row) => (
              <div key={row.poolCode} className="grid grid-cols-[2.8rem_1fr] gap-2">
                <div className="flex items-center justify-center text-lg font-semibold text-red-500">
                  [{row.handicapLabel}]
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {row.outcomes.map((outcome) => {
                    const key = selectionKey(match, row, outcome);
                    const selected = selections.has(key);
                    const disabled = outcome.odd === null;
                    return (
                      <button
                        key={outcome.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onToggle(match, row, outcome)}
                        className={`min-h-16 rounded-lg border px-1 py-1.5 text-center transition ${
                          selected
                            ? "border-red-500 bg-red-50 text-red-600 shadow-sm"
                            : disabled
                              ? "border-neutral-100 bg-neutral-50 text-neutral-300"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-red-300"
                        }`}
                        aria-pressed={selected}
                      >
                        <span className="block text-base font-bold">{outcome.label}</span>
                        <span className="block text-sm tabular-nums">
                          {outcome.odd?.toFixed(2) ?? "--"}
                        </span>
                        <span
                          className={`block text-[11px] tabular-nums ${
                            selected ? "text-red-500" : "text-sky-600"
                          }`}
                        >
                          {pct(outcome.probability)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
            <span>{match.status === "Selling" ? "官方在售赔率" : match.status || "官方赔率"}</span>
            <span>{match.rows[0]?.updateAt ? `更新 ${match.rows[0].updateAt}` : ""}</span>
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
    <div className={embedded ? "pb-64" : "min-h-screen bg-neutral-100 pb-64"}>
      {!embedded && (
      <div className="sticky top-14 z-10 border-b border-red-200 bg-white">
        <div className="mx-auto max-w-4xl px-3 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {["胜平负/让球", "比分", "总进球数", "半全场", "混合过关"].map((tab) => (
              <span
                key={tab}
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm ${
                  tab === "混合过关"
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-neutral-200 bg-white text-neutral-500"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>
        </div>
      </div>
      )}

      <main className="mx-auto max-w-4xl">
        <section className={embedded ? "rounded-xl border border-neutral-200 bg-white px-4 py-4" : "bg-white px-4 py-4"}>
          <h2 className="text-xl font-bold text-neutral-900">体彩官方赔率</h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            数据来自中国竞彩网公开足球计算器。百分比为赔率反推的归一化概率，仅作信息换算。
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">
              来源：{payload.source}
            </span>
            <a
              href={payload.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-sky-700"
            >
              官方页面
            </a>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">
              更新时间：{payload.lastUpdated ?? "以官方页面为准"}
            </span>
          </div>
          {payload.error && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {payload.error}
            </p>
          )}
        </section>

        {payload.days.length === 0 ? (
          <div className="m-4 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            暂时没有读取到官方赔率。可以稍后刷新，或检查官方计算器页面是否正常开放。
          </div>
        ) : (
          payload.days.map((day) => (
            <section
              key={day.businessDate}
              className={`mt-3 overflow-hidden bg-white ${embedded ? "rounded-xl border border-neutral-200" : ""}`}
            >
              <div className="flex items-center justify-between border-y border-neutral-200 px-4 py-3">
                <div className="text-sm font-medium text-neutral-700">
                  {formatBusinessDate(day.businessDate)}
                  <span className="ml-2 font-normal text-neutral-500">
                    共{day.matches.length}场比赛
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-sm text-red-500">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  仅展示
                </span>
              </div>
              {day.matches.map((match) => (
                <MatchOdds
                  key={match.matchId}
                  match={match}
                  selections={selections}
                  onToggle={toggle}
                />
              ))}
            </section>
          ))
        )}

        <p className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          {DISCLAIMER}
          本页仅展示官方公开赔率并提供模拟金额与概率换算，不提供下单、出票、代购或任何购彩建议。
        </p>
      </main>

      <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        {showDetails && selected.length > 0 && (
          <div className="mx-auto max-h-40 max-w-4xl overflow-auto border-b border-neutral-100 px-4 py-3 text-sm">
            <div className="mb-2 font-medium text-neutral-700">已选明细</div>
            <div className="space-y-1">
              {selected.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-neutral-600">
                    {item.matchNum} {item.matchLabel} · {item.poolName}[{item.handicapLabel}] ·{" "}
                    {item.outcomeLabel}
                  </span>
                  <span className="shrink-0 tabular-nums text-red-500">
                    {item.odd.toFixed(2)} / {pct(item.probability)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto grid max-w-4xl grid-cols-[5.5rem_1fr_5rem] gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr_7rem]">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="relative rounded-lg border border-neutral-200 py-3 text-sm text-neutral-700"
          >
            <span className="absolute -left-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-base font-semibold text-white">
              {selected.length}
            </span>
            已选
          </button>

          <label className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-600">
            过关选择
            <select
              value={effectivePass}
              disabled={passOptions.length === 0}
              onChange={(event) => setPassM(Number(event.target.value))}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-red-500 outline-none disabled:text-neutral-300"
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
            className="rounded-lg border border-neutral-200 py-3 text-sm text-neutral-500 disabled:text-neutral-300"
            disabled={selected.length === 0}
          >
            清空
          </button>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-[5.5rem_1fr_7rem] gap-3 px-4 pb-4 sm:grid-cols-[7rem_1fr_8rem]">
          <label className="rounded-lg border border-neutral-200 px-2 py-2 text-center text-sm text-neutral-600">
            <input
              value={multiple}
              min={1}
              max={50}
              inputMode="numeric"
              onChange={(event) => {
                const next = Math.max(1, Math.min(50, Number(event.target.value) || 1));
                setMultiple(next);
              }}
              className="w-10 text-center text-lg font-semibold text-red-500 outline-none"
            />
            倍
          </label>

          <div className="grid content-center gap-1 text-sm text-neutral-500">
            <div>
              模拟金额：
              <span className="font-semibold tabular-nums text-red-500">
                {money(simulatedAmount)}
              </span>
              元
              <span className="ml-2 text-xs text-neutral-400">每注2元 · {ticketCount}注</span>
            </div>
            <div>
              理论最高金额：
              <span className="font-semibold tabular-nums text-red-500">{money(maxReturn)}</span>
              元
            </div>
            <div>
              命中≥{effectivePass}场概率估算：
              <span className="font-semibold tabular-nums text-sky-600">
                {pct(hitProbability)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="rounded-lg bg-red-500 px-2 py-3 text-sm font-medium text-white disabled:bg-neutral-200"
            disabled={selected.length === 0}
          >
            查看明细
          </button>
        </div>
      </aside>
    </div>
  );
}
