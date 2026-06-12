"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number; y: number; vx: number; vy: number;
  r: number; pulse: number; pulseSpeed: number; layer: number;
}
interface Pulse {
  fromX: number; fromY: number; toX: number; toY: number;
  t: number; speed: number; color: string;
}

const LAYER_COLORS = [
  "rgba(12,157,104,","rgba(185,122,10,","rgba(12,157,104,","rgba(185,122,10,",
];
const PULSE_COLORS = ["rgba(12,157,104,1)", "rgba(185,122,10,1)"];
const LAYER_COUNTS = [5, 7, 7, 4];

export default function NeuralCanvas({ active = false, className = "" }: { active?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<{ nodes: Node[]; pulses: Pulse[] }>({ nodes: [], pulses: [] });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const buildNodes = (): Node[] => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const nodes: Node[] = [];
      LAYER_COUNTS.forEach((count, layer) => {
        const lx = W * (layer + 1) / (LAYER_COUNTS.length + 1);
        for (let i = 0; i < count; i++) {
          nodes.push({
            x: lx + (Math.random() - 0.5) * 18,
            y: H * (i + 1) / (count + 1) + (Math.random() - 0.5) * 18,
            vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
            r: 3 + Math.random() * 2.5, pulse: Math.random(),
            pulseSpeed: 0.008 + Math.random() * 0.012, layer,
          });
        }
      });
      return nodes;
    };
    stateRef.current.nodes = buildNodes();

    let lastPulse = 0;
    const spawnPulse = (nodes: Node[], time: number) => {
      if (!active || time - lastPulse < 100) return;
      lastPulse = time;
      const layer = Math.floor(Math.random() * (LAYER_COUNTS.length - 1));
      const from = nodes.filter((n) => n.layer === layer);
      const to = nodes.filter((n) => n.layer === layer + 1);
      if (!from.length || !to.length) return;
      const f = from[Math.floor(Math.random() * from.length)];
      const t = to[Math.floor(Math.random() * to.length)];
      stateRef.current.pulses.push({ fromX: f.x, fromY: f.y, toX: t.x, toY: t.y, t: 0, speed: 0.018 + Math.random() * 0.022, color: PULSE_COLORS[layer % 2] });
    };

    const draw = (time: number) => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      const { nodes, pulses } = stateRef.current;
      spawnPulse(nodes, time);

      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        const lx = W * (n.layer + 1) / (LAYER_COUNTS.length + 1);
        n.vx -= (n.x - lx) * 0.0012; n.vy *= 0.992;
        if (n.y < 8 || n.y > H - 8) n.vy *= -1;
        n.pulse = (n.pulse + n.pulseSpeed) % 1;
      });

      for (let l = 0; l < LAYER_COUNTS.length - 1; l++) {
        const fromNodes = nodes.filter((n) => n.layer === l);
        const toNodes = nodes.filter((n) => n.layer === l + 1);
        fromNodes.forEach((f) => toNodes.forEach((t) => {
          const dist = Math.hypot(f.x - t.x, f.y - t.y);
          ctx.strokeStyle = `rgba(12,157,104,${Math.max(0, 0.12 - dist / 2000)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        }));
      }

      stateRef.current.pulses = pulses.filter((p) => p.t <= 1);
      stateRef.current.pulses.forEach((p) => {
        p.t += p.speed;
        const cx = p.fromX + (p.toX - p.fromX) * p.t;
        const cy = p.fromY + (p.toY - p.fromY) * p.t;
        const alpha = Math.sin(p.t * Math.PI);
        ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(",1)", `,${alpha})`); ctx.fill();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10);
        g.addColorStop(0, p.color.replace(",1)", `,${alpha * 0.4})`)); g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      });

      nodes.forEach((n) => {
        const a = 0.55 + Math.sin(n.pulse * Math.PI * 2) * 0.25;
        const col = LAYER_COLORS[n.layer];
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.5);
        g.addColorStop(0, `${col}${(a * 0.5).toFixed(2)})`); g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 3.5, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `${col}${a.toFixed(2)})`; ctx.fill();
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [active]);

  return <canvas ref={canvasRef} className={`w-full h-full ${className}`} style={{ display: "block" }} />;
}
