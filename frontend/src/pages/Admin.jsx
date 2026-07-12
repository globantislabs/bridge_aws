import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import {
  Users, KeyRound, Gauge, Package, Shield, ShieldOff, Ban, Check,
  Plus, Trash2, Save, RefreshCw,
} from "lucide-react";

const TABS = [
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "users", label: "Users", icon: Users },
  { id: "providers", label: "AI Providers", icon: KeyRound },
  { id: "plans", label: "Plans", icon: Package },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("usage");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) nav("/login");
  }, [user, loading, nav]);

  if (loading || !user || user.role !== "admin") {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col" data-testid="admin-page">
      <Nav />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-6 h-6 text-active" />
          <div>
            <h1 className="h-brand text-3xl font-medium tracking-tight">Admin console</h1>
            <div className="text-xs uppercase tracking-widest text-white/40">Signed in as {user.email}</div>
          </div>
        </div>

        <div className="flex overflow-x-auto scrollbar-thin gap-2 mb-6 pb-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                tab === id ? "bg-white text-void" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
              data-testid={`admin-tab-${id}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "usage" && <UsageTab />}
        {tab === "users" && <UsersTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "plans" && <PlansTab />}
      </main>
    </div>
  );
}

/* -------- Usage tab -------- */
function UsageTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/usage");
      setData(data);
    } catch { toast.error("Failed to load usage"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading || !data) return <div className="text-white/50 p-8">Loading usage…</div>;

  return (
    <div className="space-y-6" data-testid="admin-usage-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Users" value={data.total_users} />
        <Stat label="Rooms created" value={data.total_rooms_created} />
        <Stat label="Meeting joins 30d" value={data.meeting_joins_30d} />
        <Stat label="Est. cost (30d)" value={`$${data.estimated_cost_usd_30d}`} highlight />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Translations 30d" value={data.translate_events_30d} />
        <Stat label="Translations 7d" value={data.translate_events_7d} />
        <Stat label="TTS events 30d" value={data.tts_events_30d} />
        <button onClick={load} className="milled rounded-2xl p-4 flex items-center justify-center gap-2 hover:bg-white/10" data-testid="admin-usage-refresh">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      <div className="milled rounded-2xl p-6">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Top translation users (30d)</div>
        {data.top_translate_users?.length === 0 ? (
          <div className="text-white/40 text-sm">No usage yet.</div>
        ) : (
          <div className="space-y-2">
            {data.top_translate_users.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-white/90">{r.user?.name || r.user?.email || r.user_id}</div>
                  <div className="text-white/40 text-xs">{r.user?.email}</div>
                </div>
                <div className="text-white/80">{r.chars.toLocaleString()} chars · {r.count} calls</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`milled rounded-2xl p-4 ${highlight ? "border-active/40 bg-active/[0.03]" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="h-brand text-2xl font-medium mt-1">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

/* -------- Users tab -------- */
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const load = async () => {
    try {
      const [u, p] = await Promise.all([api.get("/admin/users"), api.get("/plans")]);
      setUsers(u.data);
      setPlans(p.data);
    } catch { toast.error("Failed to load users"); }
  };
  useEffect(() => { load(); }, []);

  const change = async (fn, msg) => {
    try { await fn(); toast.success(msg); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <div className="milled rounded-2xl overflow-hidden" data-testid="admin-users-tab">
      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
        <div className="col-span-4">User</div>
        <div className="col-span-2">Role</div>
        <div className="col-span-2">Plan</div>
        <div className="col-span-2">Provider</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>
      {users.map((u) => (
        <div key={u.user_id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 items-center" data-testid={`user-row-${u.user_id}`}>
          <div className="md:col-span-4">
            <div className="text-sm text-white/90">{u.name}</div>
            <div className="text-xs text-white/40">{u.email}</div>
          </div>
          <div className="md:col-span-2 text-sm">
            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest ${
              u.role === "admin" ? "bg-active/20 text-active" : "bg-white/10 text-white/70"
            }`}>{u.role}</span>
          </div>
          <div className="md:col-span-2">
            <select
              value={u.plan_id || "plan_free"}
              onChange={(e) => change(
                () => api.post("/admin/users/plan", { user_id: u.user_id, plan_id: e.target.value }),
                "Plan updated",
              )}
              className="input-field text-sm !py-1.5"
              data-testid={`user-plan-${u.user_id}`}
            >
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 text-xs text-white/40 uppercase tracking-widest">{u.provider}</div>
          <div className="md:col-span-2 flex flex-wrap gap-2 md:justify-end">
            <button
              className="btn-ghost text-xs flex items-center gap-1"
              onClick={() => change(
                () => api.post("/admin/users/role", { user_id: u.user_id, role: u.role === "admin" ? "user" : "admin" }),
                "Role updated",
              )}
              data-testid={`user-role-toggle-${u.user_id}`}
            >
              {u.role === "admin" ? <><ShieldOff className="w-3.5 h-3.5" /> Demote</> : <><Shield className="w-3.5 h-3.5" /> Promote</>}
            </button>
            <button
              className={`ctrl-btn !h-8 !min-w-8 !p-2 ${u.disabled ? "muted" : ""}`}
              onClick={() => change(
                () => api.post("/admin/users/disable", { user_id: u.user_id, disabled: !u.disabled }),
                u.disabled ? "User enabled" : "User disabled",
              )}
              data-testid={`user-disable-${u.user_id}`}
              title={u.disabled ? "Enable" : "Disable"}
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------- Providers tab -------- */
function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [activeLlm, setActiveLlm] = useState("");
  const [activeTts, setActiveTts] = useState("");
  const [keys, setKeys] = useState({});

  const load = async () => {
    const { data } = await api.get("/admin/providers");
    setProviders(data.providers);
    setActiveLlm(data.active_llm);
    setActiveTts(data.active_tts);
  };
  useEffect(() => { load(); }, []);

  const saveKey = async (pid) => {
    try {
      await api.post("/admin/providers/key", { provider_id: pid, api_key: keys[pid] });
      toast.success("API key saved");
      setKeys((k) => ({ ...k, [pid]: "" }));
      load();
    } catch { toast.error("Save failed"); }
  };

  const setActive = async (kind, pid) => {
    try {
      await api.post("/admin/providers/active", { kind, provider_id: pid });
      toast.success("Active provider updated");
      load();
    } catch { toast.error("Update failed"); }
  };

  const toggleEnabled = async (p) => {
    await api.post("/admin/providers", { ...p, enabled: !p.enabled });
    load();
  };

  return (
    <div className="space-y-6" data-testid="admin-providers-tab">
      <div className="milled rounded-2xl p-6">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Active providers</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40">Translation (LLM)</label>
            <select value={activeLlm} onChange={(e) => setActive("llm", e.target.value)} className="input-field mt-1" data-testid="active-llm-select">
              {providers.filter((p) => p.enabled).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40">Text-to-Speech</label>
            <select value={activeTts} onChange={(e) => setActive("tts", e.target.value)} className="input-field mt-1" data-testid="active-tts-select">
              {providers.filter((p) => p.enabled && p.kind.includes("tts")).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {providers.filter((p) => p.enabled && p.kind.includes("tts")).length === 0 && <option value="">— none configured —</option>}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.id} className="milled rounded-2xl p-5" data-testid={`provider-${p.id}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-brand text-lg font-medium">{p.name}</div>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">{p.kind}</span>
                </div>
                <div className="text-xs text-white/40 mt-1">Models: {p.models.join(", ")}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  {p.key_set ? <span className="text-active">Key set {p.key_masked}</span> : "No key"}
                </div>
                <button
                  onClick={() => toggleEnabled(p)}
                  className={`ctrl-btn !h-8 !min-w-8 !p-2 ${p.enabled ? "active" : ""}`}
                  data-testid={`provider-toggle-${p.id}`}
                  title={p.enabled ? "Disable" : "Enable"}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={keys[p.id] || ""}
                onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                placeholder={`Paste ${p.name} API key…`}
                className="input-field text-sm flex-1"
                data-testid={`provider-key-input-${p.id}`}
              />
              <button
                onClick={() => saveKey(p.id)}
                disabled={!keys[p.id]}
                className="btn-primary text-sm !py-2 !px-4 flex items-center gap-2 disabled:opacity-50"
                data-testid={`provider-save-key-${p.id}`}
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- Plans tab -------- */
function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [draft, setDraft] = useState(null);

  const load = async () => {
    const { data } = await api.get("/plans");
    setPlans(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/admin/plans", {
        id: draft.id,
        name: draft.name,
        price_usd: parseFloat(draft.price_usd),
        meeting_minutes_per_month: parseInt(draft.meeting_minutes_per_month),
        translation_minutes_per_month: parseInt(draft.translation_minutes_per_month),
        max_participants: parseInt(draft.max_participants),
        features: (draft.features_text || "").split("\n").map((s) => s.trim()).filter(Boolean),
        highlight: !!draft.highlight,
      });
      toast.success("Plan saved");
      setDraft(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const del = async (id) => {
    try {
      await api.delete(`/admin/plans/${id}`);
      toast.success("Plan removed");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  const edit = (p) => setDraft({ ...p, features_text: (p.features || []).join("\n") });

  return (
    <div className="space-y-6" data-testid="admin-plans-tab">
      <div className="flex justify-between items-center">
        <div className="text-xs uppercase tracking-widest text-white/40">All plans</div>
        <button
          onClick={() => setDraft({
            id: "", name: "New plan", price_usd: 0, meeting_minutes_per_month: 0,
            translation_minutes_per_month: 0, max_participants: 4, features_text: "",
            highlight: false,
          })}
          className="btn-ghost text-sm flex items-center gap-2"
          data-testid="admin-add-plan-btn"
        >
          <Plus className="w-3.5 h-3.5" /> Add plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="milled rounded-2xl p-5" data-testid={`plan-admin-${p.id}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-brand text-xl font-medium">{p.name}</div>
              {!["plan_free", "plan_pro", "plan_enterprise"].includes(p.id) && (
                <button onClick={() => del(p.id)} className="text-white/40 hover:text-signal" data-testid={`plan-delete-${p.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="text-white/60 text-sm mb-3">${p.price_usd}/mo · {p.meeting_minutes_per_month} min meetings · {p.translation_minutes_per_month} min translation</div>
            <button onClick={() => edit(p)} className="btn-ghost text-xs w-full" data-testid={`plan-edit-${p.id}`}>Edit</button>
          </div>
        ))}
      </div>

      {draft && (
        <div className="milled rounded-2xl p-6 space-y-3">
          <div className="text-xs uppercase tracking-widest text-white/40">Edit / create plan</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldInput label="ID (leave blank for new)" value={draft.id} onChange={(v) => setDraft({ ...draft, id: v })} testid="plan-id-input" />
            <FieldInput label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} testid="plan-name-input" />
            <FieldInput label="Price (USD)" type="number" value={draft.price_usd} onChange={(v) => setDraft({ ...draft, price_usd: v })} testid="plan-price-input" />
            <FieldInput label="Max participants" type="number" value={draft.max_participants} onChange={(v) => setDraft({ ...draft, max_participants: v })} testid="plan-max-parts-input" />
            <FieldInput label="Meeting min / month" type="number" value={draft.meeting_minutes_per_month} onChange={(v) => setDraft({ ...draft, meeting_minutes_per_month: v })} testid="plan-mmpm-input" />
            <FieldInput label="Translation min / month" type="number" value={draft.translation_minutes_per_month} onChange={(v) => setDraft({ ...draft, translation_minutes_per_month: v })} testid="plan-tmpm-input" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40">Features (one per line)</label>
            <textarea rows={5} value={draft.features_text} onChange={(e) => setDraft({ ...draft, features_text: e.target.value })} className="input-field mt-1 font-mono text-xs" data-testid="plan-features-input" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.highlight} onChange={(e) => setDraft({ ...draft, highlight: e.target.checked })} data-testid="plan-highlight-input" />
            Highlight as "most popular"
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-sm flex items-center gap-2" data-testid="plan-save-btn">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={() => setDraft(null)} className="btn-ghost text-sm" data-testid="plan-cancel-btn">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({ label, value, onChange, type = "text", testid }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-white/40">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input-field mt-1" data-testid={testid} />
    </div>
  );
}
