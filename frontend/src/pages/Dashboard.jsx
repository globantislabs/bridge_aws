import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ArrowRight, Copy, Video, Languages as LangIcon, Sparkles, Gauge } from "lucide-react";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [usage, setUsage] = useState(null);
  const [sub, setSub] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!loading && !user) nav("/login");
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    (async () => {
      try {
        const [{ data: u }, { data: s }] = await Promise.all([
          api.get("/me/usage"),
          api.get("/me/subscription"),
        ]);
        setUsage(u);
        setSub(s);
      } catch {}
    })();
  }, [user]);

  const createRoom = async () => {
    if (!name.trim()) return toast.error("Enter a display name");
    try {
      const { data } = await api.post("/rooms", { host_name: name });
      localStorage.setItem("bridge:name", name);
      localStorage.setItem(`bridge:host:${data.code}`, "1");
      nav(`/j/${data.code}`);
    } catch { toast.error("Failed to create room"); }
  };

  const joinRoom = async () => {
    if (!code.trim() || !name.trim()) return toast.error("Enter your name and room code");
    try {
      await api.get(`/rooms/${code.trim().toLowerCase()}`);
      localStorage.setItem("bridge:name", name);
      nav(`/j/${code.trim().toLowerCase()}`);
    } catch { toast.error("Room not found"); }
  };

  const copyRef = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/register`);
    toast.success("Referral link copied");
  };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col" data-testid="dashboard-page">
      <Nav />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
        {/* Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-active mb-2">Hello, {user.name.split(" ")[0]}</div>
            <h1 className="h-brand text-3xl sm:text-4xl font-medium tracking-tight">Your workspace</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyRef} className="btn-ghost text-sm flex items-center gap-2" data-testid="dashboard-copy-ref">
              <Copy className="w-3.5 h-3.5" /> Share Bridge
            </button>
            <Link to="/pricing" className="btn-primary text-sm !py-2 !px-4" data-testid="dashboard-upgrade">
              <Sparkles className="w-3.5 h-3.5 inline mr-1" /> Upgrade
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Start meeting */}
          <div className="lg:col-span-7 milled rounded-3xl p-6 sm:p-8">
            <div className="text-xs uppercase tracking-[0.25em] text-white/40 mb-4">Start</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40">Display name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input-field mt-1" data-testid="dashboard-name-input" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40">Or join with code</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="abc-def-ghi" className="input-field mt-1" data-testid="dashboard-code-input" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button onClick={createRoom} className="btn-primary flex-1 flex items-center justify-center gap-2" data-testid="dashboard-host-btn">
                <Video className="w-4 h-4" /> Host new meeting
              </button>
              <button onClick={joinRoom} className="btn-ghost flex-1 flex items-center justify-center gap-2" data-testid="dashboard-join-btn">
                Join meeting <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Current plan */}
          <div className="lg:col-span-5 milled rounded-3xl p-6 sm:p-8">
            <div className="text-xs uppercase tracking-[0.25em] text-white/40 mb-2">Current plan</div>
            <div className="flex items-baseline gap-2">
              <div className="h-brand text-3xl font-medium">{sub?.plan?.name || "Free"}</div>
              <div className="text-white/40 text-sm">${sub?.plan?.price_usd ?? 0}/mo</div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              {(sub?.plan?.features || []).map((f, i) => (
                <li key={i} className="flex items-start gap-2"><span className="text-active">•</span>{f}</li>
              ))}
            </ul>
            {sub?.plan?.id !== "plan_enterprise" && (
              <Link to="/pricing" className="btn-ghost text-sm mt-5 inline-flex items-center gap-2" data-testid="dashboard-view-plans">
                See all plans <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Usage cards */}
          <div className="lg:col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Video className="w-4 h-4" />} label="Meetings (30d)" value={usage?.meetings ?? 0} />
            <StatCard icon={<LangIcon className="w-4 h-4" />} label="Translation chars (30d)" value={usage?.translate_chars ?? 0} />
            <StatCard icon={<Gauge className="w-4 h-4" />} label="TTS chars (30d)" value={usage?.tts_chars ?? 0} />
            <StatCard icon={<Sparkles className="w-4 h-4" />} label="Role" value={user.role} />
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="milled rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2 text-white/50">
        <div className="text-[10px] uppercase tracking-widest">{label}</div>
        {icon}
      </div>
      <div className="h-brand text-2xl font-medium">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
