import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Eye, EyeOff } from "lucide-react";
import NeuralBackground from "@/components/NeuralBackground";
import CoverScreen from "@/components/CoverScreen";

const Index = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coverDismissed, setCoverDismissed] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate("/dashboard");
    }, 1400);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {!coverDismissed && <CoverScreen onDismiss={() => setCoverDismissed(true)} />}
      {/* Animated SEO H1 (visually integrated below) */}
      <NeuralBackground />

      {/* Ambient glow orbs */}
      <div
        className="glow-orb pointer-events-none absolute -left-40 top-1/4 h-[500px] w-[500px] rounded-full"
        style={{ animation: "float-orb 18s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div
        className="glow-orb pointer-events-none absolute -right-40 bottom-1/4 h-[600px] w-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(var(--neon-purple) / 0.25), transparent 70%)",
          animation: "float-orb 22s ease-in-out infinite reverse",
        }}
        aria-hidden="true"
      />

      {/* Perspective grid floor */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60vh] overflow-hidden opacity-50">
        <div className="grid-floor absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, transparent 0%, hsl(var(--background)) 90%)",
          }}
        />
      </div>

      {/* Scan line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px opacity-60"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(var(--neon-cyan)), transparent)",
          animation: "scan-line 8s linear infinite",
          boxShadow: "0 0 20px hsl(var(--neon-cyan))",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-20 flex min-h-screen flex-col items-center justify-center px-6">
        {/* Top tag */}
        <div
          className="mb-12 flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-muted-foreground"
          style={{ animation: "fade-up 0.8s ease-out" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))] animate-pulse" />
          Neural Memory Interface
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))] animate-pulse" />
        </div>

        {/* Brand */}
        <h1
          className="neon-text mb-3 text-center text-6xl font-black tracking-[0.2em] sm:text-7xl md:text-8xl"
          style={{ animation: "fade-up 1s ease-out 0.1s backwards", fontFamily: "'Inter', sans-serif" }}
        >
          AGENT PLANET
        </h1>

        <p
          className="mb-12 text-center text-sm font-light tracking-[0.3em] text-muted-foreground"
          style={{ animation: "fade-up 1s ease-out 0.25s backwards" }}
        >
          ACCESS · YOUR · MEMORY · CORE
        </p>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel relative w-full max-w-md rounded-3xl p-8"
          style={{ animation: "fade-up 1s ease-out 0.4s backwards" }}
        >
          {/* Corner accents */}
          <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-primary rounded-tl-3xl" />
          <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-accent rounded-tr-3xl" />
          <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-secondary rounded-bl-3xl" />
          <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-primary rounded-br-3xl" />

          <label
            htmlFor="password"
            className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground"
          >
            <Lock className="h-3 w-3" />
            Cipher Key
          </label>

          <div className="group relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•  •  •  •  •  •  •  •"
              autoComplete="current-password"
              className="w-full rounded-xl border border-border/40 bg-input/60 px-5 py-4 pr-14 text-lg tracking-[0.3em] text-foreground placeholder:text-muted-foreground/40 outline-none transition-all duration-300 focus:border-primary focus:bg-input/80 focus:shadow-[0_0_30px_hsl(var(--primary)/0.4),inset_0_0_20px_hsl(var(--primary)/0.05)]"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="group relative mt-6 flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-primary px-6 py-4 text-sm font-bold uppercase tracking-[0.3em] text-primary-foreground transition-all duration-300 hover:shadow-[0_0_40px_hsl(var(--primary)/0.6)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              className="absolute inset-0 -translate-x-full transition-transform duration-700 group-hover:translate-x-full"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(var(--neon-pink) / 0.4), transparent)",
              }}
            />
            <span className="relative">{loading ? "Authenticating…" : "Initialize"}</span>
            {!loading && (
              <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            )}
          </button>

          <div className="mt-6 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-secondary animate-pulse" />
              Encrypted · 256bit
            </span>
            <button type="button" className="transition-colors hover:text-primary">
              Recover Key →
            </button>
          </div>
        </form>

        {/* Footer signature */}
        <div
          className="mt-12 text-center text-[10px] uppercase tracking-[0.4em] text-muted-foreground/60"
          style={{ animation: "fade-up 1s ease-out 0.6s backwards" }}
        >
          v2.0.4 · Synaptic Build · © Agent Planet Systems
        </div>
      </div>

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, hsl(var(--background) / 0.7) 100%)",
        }}
        aria-hidden="true"
      />
    </main>
  );
};

export default Index;
