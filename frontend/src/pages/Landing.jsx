import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";
import { api, LANGUAGES } from "../lib/api";
import {
  ArrowRight, Languages, Shield, Users, MessageSquare, MonitorUp,
  Sparkles, Globe, Zap, Check,
} from "lucide-react";

export default function Landing() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const createRoom = async () => {
    if (!name.trim()) return toast.error("Enter your name");
    setBusy(true);
    try {
      const { data } = await api.post("/rooms", { host_name: name });
      localStorage.setItem("bridge:name", name);
      localStorage.setItem(`bridge:host:${data.code}`, "1");
      nav(`/j/${data.code}`);
    } catch { toast.error("Could not create room"); }
    finally { setBusy(false); }
  };

  const joinRoom = async () => {
    const c = code.trim().toLowerCase();
    if (!name.trim() || !c) return toast.error("Enter your name and code");
    try {
      await api.get(`/rooms/${c}`);
      localStorage.setItem("bridge:name", name);
      nav(`/j/${c}`);
    } catch { toast.error("Room not found"); }
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="landing-page">
      <Nav transparent />

      {/* Hero */}
      <section className="pt-24 sm:pt-32 pb-20 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 animate-fade-in">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-active mb-6">
              <span className="w-2 h-2 rounded-full bg-active animate-pulse" />
              live voice translation · 10 languages · zero setup
            </div>
            <h1 className="h-brand text-5xl sm:text-7xl font-medium tracking-tight leading-[0.95]">
              meetings
              <br />
              <span className="text-white/50">without</span> borders.
            </h1>
            <p className="text-white/60 text-lg mt-8 max-w-lg leading-relaxed">
              Bridge is a production-grade video meeting platform with instant voice-to-voice
              translation and word-by-word live transcription. Speak your language, listen in theirs.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 text-sm text-white/60">
              <FeatureChip icon={<Languages className="w-4 h-4" />} label="Voice-to-voice translation" />
              <FeatureChip icon={<Zap className="w-4 h-4" />} label="Word-by-word captions" />
              <FeatureChip icon={<MonitorUp className="w-4 h-4" />} label="Screen share" />
              <FeatureChip icon={<Users className="w-4 h-4" />} label="Host controls" />
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link to={user ? "/dashboard" : "/register"} className="btn-primary flex items-center gap-2" data-testid="hero-cta-primary">
                {user ? "Open dashboard" : "Start for free"} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="btn-ghost" data-testid="hero-cta-pricing">See plans</Link>
            </div>
          </div>

          {/* Bento actions */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="milled rounded-3xl p-6 sm:p-7 animate-slide-up">
              <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-4">
                start / join · guest ok
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your display name" className="input-field mb-3" data-testid="landing-name-input" maxLength={64} />
              <button onClick={createRoom} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 mb-3" data-testid="create-meeting-btn">
                {busy ? "Creating…" : "Host new meeting"} <ArrowRight className="w-4 h-4" />
              </button>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="abc-def-ghi" className="input-field mb-3 tracking-widest" data-testid="landing-code-input" maxLength={16} />
              <button onClick={joinRoom} className="btn-ghost w-full flex items-center justify-center gap-2" data-testid="join-meeting-btn">
                Join meeting
              </button>
            </div>
            <div className="text-xs text-white/40 mt-1 leading-relaxed">
              No signup needed to try. Create an account to save meeting history & upgrade for
              longer meetings and more translation minutes.
            </div>
          </div>
        </div>
      </section>

      {/* Languages strip */}
      <section className="border-y py-8 overflow-hidden" style={{ borderColor: "var(--c-border)", background: "var(--c-surface2)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-4">Speak · listen in any of these</div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <div key={l.code} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
                <span className="text-active mr-2">{l.flag}</span>{l.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-20 sm:py-28 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-14">
            <div className="text-xs uppercase tracking-[0.25em] text-active mb-3">Why Bridge</div>
            <h2 className="h-brand text-3xl sm:text-5xl font-medium tracking-tight">
              Zoom-grade meetings.
              <br />
              <span className="text-white/50">Only, actually global.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon={<Globe className="w-5 h-5" />} title="Voice-to-voice translation" body="OpenAI Realtime transcribes what you say; each listener hears it re-spoken in their language, in near real-time." />
            <FeatureCard icon={<Zap className="w-5 h-5" />} title="Word-by-word captions" body="Live streaming transcripts appear as you talk. Original + translated side by side. Downloadable at any time." />
            <FeatureCard icon={<MonitorUp className="w-5 h-5" />} title="Screen share & HD video" body="LiveKit-powered SFU delivers rock-solid HD video and low-latency screen sharing at scale." />
            <FeatureCard icon={<MessageSquare className="w-5 h-5" />} title="Chat + raise hand" body="Persistent chat, raise hand notifications, participants panel — everything you expect from a modern meeting app." />
            <FeatureCard icon={<Shield className="w-5 h-5" />} title="Host controls" body="Mute everyone, remove disruptive users, end the meeting for all with a single click." />
            <FeatureCard icon={<Sparkles className="w-5 h-5" />} title="Custom AI providers" body="On Enterprise, plug in your own OpenAI, Gemini or Claude keys — full admin panel for API keys and usage." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto milled rounded-3xl p-8 sm:p-12 text-center">
          <h3 className="h-brand text-3xl sm:text-4xl font-medium tracking-tight">
            Talk to the world today.
          </h3>
          <p className="text-white/60 mt-4 max-w-lg mx-auto">
            Free forever for small teams. Upgrade anytime for longer meetings, more translation
            minutes, and a full admin dashboard.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={user ? "/dashboard" : "/register"} className="btn-primary flex items-center gap-2" data-testid="cta-bottom-primary">
              {user ? "Open Bridge" : "Create free account"} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pricing" className="btn-ghost">Compare plans</Link>
          </div>
          <div className="text-xs text-white/40 mt-6 flex flex-wrap justify-center gap-4">
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-active" /> No credit card</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-active" /> Guest access</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-active" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-6 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/40">
          <span>© {new Date().getFullYear()} Bridge</span>
          <span className="tracking-[0.2em] uppercase">Made for global teams · LiveKit + OpenAI</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureChip({ icon, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FeatureCard({ icon, title, body }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-surface1 p-6 hover:border-white/25 transition-colors group">
      <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:bg-active/10 group-hover:border-active/40 transition-colors">
        {icon}
      </div>
      <div className="h-brand text-lg font-medium mb-2">{title}</div>
      <div className="text-sm text-white/60 leading-relaxed">{body}</div>
    </div>
  );
}
