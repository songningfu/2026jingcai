"use client";

import { useEffect, useRef } from "react";

interface Props {
  active: boolean;
  className?: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; alpha: number; pulse: number;
}
interface Connection {
  a: number; b: number; progress: number; speed: number;
}

export default function NeuralCanvas({ active, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ active });
  stateRef.current.active = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const particles: Particle[] = [];
    const connections: Connection[] = [];
    const N = 28;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const W = () => canvas.width / devicePixelRatio;
    const H = () => canvas.height / devicePixelRatio;

    // init particles
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * (W() || 300),
        y: Math.random() * (H() || 160),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 2 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.7,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // build connections (nearest neighbours)
    for (let i = 0; i < N; i++) {
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        dists.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
      }
      dists.sort((a, b) => a.d - b.d);
      dists.slice(0, 2).forEach(({ j }) => {
        if (!connections.find((c) => (c.a === i && c.b === j) || (c.a === j && c.b === i))) {
          connections.push({ a: i, b: j, progress: Math.random(), speed: 0.004 + Math.random() * 0.006 });
        }
      });
    }

    const draw = () => {
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);

      const isActive = stateRef.current.active;
      const intensity = isActive ? 1 : 0.35;

      // update particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.pulse += 0.04;
      }

      // draw connections
      for (const c of connections) {
        const a = particles[c.a], b = particles[c.b];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(12,157,104,${0.08 * intensity})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        if (isActive) {
          // pulse dot travelling along connection
          c.progress += c.speed;
          if (c.progress > 1) c.progress = 0;
          const px = a.x + dx * c.progress;
          const py = a.y + dy * c.progress;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(12,157,104,0.7)`;
          ctx.fill();
        }
      }

      // draw nodes
      for (const p of particles) {
        const glow = isActive ? (0.6 + 0.4 * Math.sin(p.pulse)) : 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(12,157,104,${glow * intensity})`;
        ctx.fill();
        if (isActive) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(12,157,104,${0.15 * glow})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} />;
}
