import { useEffect, useRef, useState } from "react";
import cover from "@/assets/cover.png";

interface Props {
  onDismiss: () => void;
}

const FADE_MS = 2400;

// Synthesize a futuristic "warp" transition sound via Web Audio API
const playWarpSound = () => {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const duration = 2.2;

    // Master
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.15);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    master.connect(ctx.destination);

    // Sweeping sine (rising shimmer)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.exponentialRampToValueAtTime(1800, now + 1.4);
    const g1 = ctx.createGain();
    g1.gain.value = 0.4;
    osc1.connect(g1).connect(master);
    osc1.start(now);
    osc1.stop(now + duration);

    // Sub drop
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(220, now);
    osc2.frequency.exponentialRampToValueAtTime(40, now + 1.6);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    osc2.connect(lp).connect(g2).connect(master);
    osc2.start(now);
    osc2.stop(now + duration);

    // Noise whoosh
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(400, now);
    bp.frequency.exponentialRampToValueAtTime(6000, now + 1.2);
    bp.Q.value = 0.9;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime(0.25, now + 0.25);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(bp).connect(gn).connect(master);
    noise.start(now);
    noise.stop(now + duration);

    setTimeout(() => ctx.close(), (duration + 0.3) * 1000);
  } catch {
    // ignore
  }
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

const ParticleTrail = ({ active }: { active: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];
    let raf = 0;
    const start = performance.now();

    const spawn = () => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        particles.push({
          x: cx + (Math.random() - 0.5) * canvas.width * 0.8,
          y: cy + (Math.random() - 0.5) * canvas.height * 0.8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 60 + Math.random() * 40,
          size: Math.random() * 2.5 + 0.5,
          hue: Math.random() < 0.5 ? 180 : Math.random() < 0.5 ? 270 : 320,
        });
      }
    };

    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.fillStyle = "hsla(230, 35%, 4%, 0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (elapsed < FADE_MS - 300) spawn();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (elapsed < FADE_MS + 400) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[101]"
      aria-hidden="true"
    />
  );
};

const CoverScreen = ({ onDismiss }: Props) => {
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const startFade = () => {
      setFading((f) => {
        if (f) return f;
        playWarpSound();
        setTimeout(() => {
          setHidden(true);
          onDismiss();
        }, FADE_MS);
        return true;
      });
    };
    window.addEventListener("click", startFade, { once: true });
    window.addEventListener("keydown", startFade, { once: true });

    let moves = 0;
    const onMove = () => {
      moves += 1;
      if (moves > 8) {
        window.removeEventListener("mousemove", onMove);
        startFade();
      }
    };
    window.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("click", startFade);
      window.removeEventListener("keydown", startFade);
      window.removeEventListener("mousemove", onMove);
    };
  }, [ready, onDismiss]);

  if (hidden) return null;

  return (
    <>
      <ParticleTrail active={fading} />
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background ease-in-out"
        style={{
          opacity: fading ? 0 : 1,
          transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), filter ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
          filter: fading ? "blur(20px) brightness(0.4)" : "blur(0px) brightness(1)",
          transform: fading ? "scale(1.08)" : "scale(1)",
          pointerEvents: fading ? "none" : "auto",
        }}
        aria-hidden={fading}
      >
        <img
          src={cover}
          alt="AGENT PLANET — Explore the Future of AI Collaboration"
          className="h-full w-full object-cover"
          style={{ animation: "fade-up 1.4s ease-out" }}
        />

        <div
          className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.5em] text-white/80"
          style={{ animation: "flicker 2s ease-in-out infinite" }}
        >
          ◂  Move · Click to Enter  ▸
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, hsl(var(--background) / 0.6) 100%)",
          }}
        />
      </div>
    </>
  );
};

export default CoverScreen;
