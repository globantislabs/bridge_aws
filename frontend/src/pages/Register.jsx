import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import Nav from "../components/Nav";
import { Video, ArrowRight, Mail, Lock, User } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await register(email, password, name);
      toast.success(`Welcome, ${u.name}!`);
      nav("/dashboard");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  const google = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="register-page">
      <Nav />
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white text-void flex items-center justify-center mb-4">
              <Video className="w-6 h-6" />
            </div>
            <h1 className="h-brand text-3xl font-medium tracking-tight">Create your account</h1>
            <p className="text-white/50 text-sm mt-2">14-day Pro trial · no credit card</p>
          </div>

          <div className="milled rounded-3xl p-6 sm:p-7">
            <button
              onClick={google}
              className="w-full btn-ghost flex items-center justify-center gap-2 mb-4"
              data-testid="google-register-btn"
            >
              <span>G</span> Sign up with Google
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
              <div className="relative flex justify-center text-[10px] tracking-widest uppercase">
                <span className="bg-surface1 px-3 text-white/40">or with email</span>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required className="input-field with-icon" data-testid="register-name-input" />
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="input-field with-icon" data-testid="register-email-input" />
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" required minLength={6} className="input-field with-icon" data-testid="register-password-input" />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60" data-testid="register-submit-btn">
                {busy ? "Creating…" : "Create account"} <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="text-center text-sm text-white/50 mt-5">
              Already have an account?{" "}
              <Link to="/login" className="text-active hover:underline" data-testid="link-to-login">Sign in</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
