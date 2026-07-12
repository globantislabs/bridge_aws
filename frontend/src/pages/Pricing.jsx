import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Check, Star, ArrowRight } from "lucide-react";

export default function Pricing() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/plans");
      setPlans(data);
    })();
  }, []);

  const choose = async (plan) => {
    if (!user) { nav("/login"); return; }
    setBusy(plan.id);
    try {
      const { data } = await api.post("/checkout/session", {
        plan_id: plan.id,
        origin: window.location.origin,
      });
      if (data.free_plan_activated) {
        toast.success(`Activated ${plan.name}`);
        nav("/dashboard");
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="pricing-page">
      <Nav />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-xs uppercase tracking-[0.25em] text-active mb-3">Pricing</div>
          <h1 className="h-brand text-4xl sm:text-5xl font-medium tracking-tight">
            Priced for teams that <span className="text-white/50">talk to the world.</span>
          </h1>
          <p className="text-white/60 mt-4">
            All plans include live voice-to-voice translation across 10 languages, HD video
            (LiveKit), and downloadable transcripts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-3xl p-6 sm:p-8 border ${
                p.highlight
                  ? "border-active bg-active/[0.03] shadow-[0_0_60px_-30px_rgba(0,229,255,0.5)]"
                  : "border-white/10 bg-surface1"
              }`}
              data-testid={`plan-card-${p.id}`}
            >
              {p.highlight && (
                <div className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-active mb-4">
                  <Star className="w-3 h-3" /> Most popular
                </div>
              )}
              <div className="h-brand text-2xl font-medium">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="h-brand text-4xl font-medium">${p.price_usd}</span>
                <span className="text-white/40 text-sm">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-white/70">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-active mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choose(p)}
                disabled={busy === p.id}
                className={`mt-7 w-full flex items-center justify-center gap-2 py-3 rounded-full transition-colors ${
                  p.highlight ? "btn-primary" : "btn-ghost"
                } disabled:opacity-60`}
                data-testid={`select-plan-${p.id}`}
              >
                {busy === p.id ? "Redirecting…" : (p.price_usd === 0 ? "Use Free" : "Choose plan")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-white/40 mt-10">
          You can change or cancel your plan anytime from the dashboard. Payments are
          processed securely by Stripe.
        </div>
      </main>
    </div>
  );
}
