"use client";

interface Score {
  home: number;
  away: number;
  prob: number;
}

interface Props {
  scores: Score[];
  homeLabel: string;
  awayLabel: string;
}

const MAX_G = 5;

export default function ScoreHeatmap({ scores, homeLabel, awayLabel }: Props) {
  const matrix: number[][] = Array.from({ length: MAX_G + 1 }, () =>
    Array(MAX_G + 1).fill(0),
  );
  for (const s of scores) {
    if (s.home <= MAX_G && s.away <= MAX_G) matrix[s.home][s.away] = s.prob;
  }
  const maxProb = Math.max(...scores.map((s) => s.prob), 0.001);
  const top3 = [...scores].sort((a, b) => b.prob - a.prob).slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="mx-auto border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="w-8 pb-1 text-faint font-normal">
                <span className="block text-[10px] leading-tight">主↓<br />客→</span>
              </th>
              {Array.from({ length: MAX_G + 1 }, (_, j) => (
                <th key={j} className="w-8 pb-1 font-num font-normal text-faint">{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MAX_G + 1 }, (_, i) => (
              <tr key={i}>
                <td className="pr-1 font-num text-faint">{i}</td>
                {Array.from({ length: MAX_G + 1 }, (_, j) => {
                  const p = matrix[i][j];
                  const intensity = p / maxProb;
                  const isTop = top3.some((s) => s.home === i && s.away === j);
                  return (
                    <td key={j} className="p-0.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-md font-num text-[10px] tabular-nums transition-all"
                        style={{
                          background: p > 0
                            ? `rgba(12,157,104,${0.08 + intensity * 0.72})`
                            : "var(--color-raised)",
                          color: intensity > 0.6 ? "white" : "var(--color-mut)",
                          fontWeight: isTop ? 700 : 400,
                          outline: isTop ? "1.5px solid rgba(12,157,104,0.7)" : "none",
                        }}
                        title={p > 0 ? `${i}-${j}: ${(p * 100).toFixed(2)}%` : ""}
                      >
                        {p > 0.004 ? `${(p * 100).toFixed(1)}` : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-center text-[10px] text-faint">
          横轴{awayLabel}进球 / 纵轴{homeLabel}进球
        </p>
      </div>

      <div className="flex gap-2">
        {top3.map((s, idx) => (
          <div key={`${s.home}-${s.away}-${idx}`} className="flex-1 rounded-lg border border-line bg-raised py-2 text-center">
            <div className="font-num text-base font-bold tabular-nums text-ink">{s.home} - {s.away}</div>
            <div className="mt-0.5 text-[11px] text-faint">{(s.prob * 100).toFixed(1)}%</div>
            {idx === 0 && <div className="mt-0.5 text-[10px] text-neon">最可能</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
