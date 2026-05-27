import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await login(name, code);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0f] px-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full bg-[#C53030]/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt="Tether"
            className="w-24 h-24 rounded-3xl mb-5 shadow-2xl"
          />
          <h1 className="text-5xl font-bold text-white tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            Tether
          </h1>
          <p className="text-blue-200 mt-2 text-sm tracking-widest uppercase" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.1rem", letterSpacing: "0.15em" }}>
            Kyle & Nathan
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-blue-200 text-xs font-semibold mb-2 uppercase tracking-widest">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kyle or Nathan"
              className="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-blue-400/60 border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#C53030] focus:border-transparent text-sm"
              autoCapitalize="words"
            />
          </div>

          <div>
            <label className="block text-blue-200 text-xs font-semibold mb-2 uppercase tracking-widest">Tether Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-blue-400/60 border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#C53030] focus:border-transparent text-sm tracking-widest font-mono"
            />
          </div>

          {error && (
            <p className="text-red-300 text-sm bg-red-900/30 rounded-xl px-3 py-2 border border-red-500/30">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg active:scale-95 transition-all disabled:opacity-60"
            style={{ background: "radial-gradient(circle at 35% 35%, #E53E3E, #742A2A)" }}
          >
            {loading ? "Connecting..." : "Connect →"}
          </button>

          <p className="text-blue-300/70 text-xs text-center" style={{ fontFamily: "'Caveat', cursive", fontSize: "0.95rem" }}>
            Use the same code with your partner to link profiles.
          </p>
        </form>
      </div>
    </div>
  );
}
