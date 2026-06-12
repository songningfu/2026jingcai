"use client";

import { useEffect, useRef } from "react";

interface Props {
  scores: { home: number; away: number; prob: number }[];
  homeLabel: string;
  awayLabel: string;
}

export default function ScoreHeatmap({ scores, homeLabel, awayLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = window.devicePixelRatio || 1;
    const SIZE = 6;
    const CELL = 44;
    const OX = CELL * 1.5, OY = CELL * 1.5;
    const W = SIZE * CELL + OX, H = SIZE * CELL + OY;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, W, H);

    const mat: number[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
    let maxP = 0;
    scores.forEach(({ home, away, prob }) => {
      if (home < SIZE && away < SIZE) { mat[home][away] = prob; if (prob > maxP) maxP = prob; }
    });
    if (maxP === 0) maxP = 0.001;

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${CELL * 0.32}px -apple-system,sans-serif`; ctx.fillStyle = "#98a69e";
    for (let a = 0; a < SIZE; a++) ctx.fillText(String(a), OX + a * CELL + CELL / 2, OY - CELL * 0.6);
    for (let h = 0; h < SIZE; h++) ctx.fillText(String(h), OX - CELL * 0.6, OY + h * CELL + CELL / 2);

    ctx.font = `${CELL * 0.26}px -apple-system,sans-serif`; ctx.fillStyle = "#5c6b63";
    ctx.save(); ctx.translate(OX - CELL * 1.1, OY + (SIZE * CELL) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(homeLabel.slice(0, 4), 0, 0); ctx.restore();
    ctx.fillText(awayLabel.slice(0, 4), OX + (SIZE * CELL) / 2, OY - CELL * 1.1);

    for (let h = 0; h < SIZE; h++) {
      for (let a = 0; a < SIZE; a++) {
        const p = mat[h][a]; if (p < 0.001) continue;
        const ratio = p / maxP;
        const cx = OX + a * CELL + CELL / 2, cy = OY + h * CELL + CELL / 2;
        const r = CELL * 0.42 * Math.sqrt(ratio);
        const alpha = 0.15 + ratio * 0.7;
        const isTop = ratio > 0.55;
        const color = isTop ? `rgba(12,157,104,${alpha})` : `rgba(185,122,10,${alpha * 0.8})`;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
        g.addColorStop(0, color); g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(cx, cy, r * 2, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        if (ratio > 0.3) {
          ctx.font = `bold ${CELL * 0.24}px -apple-system,sans-serif`;
          ctx.fillStyle = isTop ? "#0c9d68" : "#b97a0a";
          ctx.fillText(`${(p * 100).toFixed(1)}%`, cx, cy);
        }
      }
    }
  }, [scores, homeLabel, awayLabel]);

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} className="max-w-full" />
      <p className="text-xs text-faint">气泡大小 ∝ 概率 · 横轴客队进球 · 纵轴主队进球</p>
    </div>
  );
}
