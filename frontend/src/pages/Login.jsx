import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import Nav from "../components/Nav";
import { Video, ArrowRight, Mail, Lock } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.name}`);
      nav(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const google = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="login-page">
      <Nav />
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white text-void flex items-center justify-center mb-4">
              <Video className="w-6 h-6" />
            </div>
            <h1 className="h-brand text-3xl font-medium tracking-tight">Welcome back</h1>
            <p className="text-white/50 text-sm mt-2">Sign in to host meetings & manage your subscription</p>
          </div>

          <div className="milled rounded-3xl p-6 sm:p-7">
            <button
              onClick={google}
              className="w-full btn-ghost flex items-center justify-center gap-2 mb-4"
              data-testid="google-login-btn"
            >
              <GoogleIcon /> Continue with Google
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
              <div className="relative flex justify-center text-[10px] tracking-widest uppercase">
                <span className="bg-surface1 px-3 text-white/40">or with email</span>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="input-field with-icon"
                  data-testid="login-email-input"
                />
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="input-field with-icon"
                  data-testid="login-password-input"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="login-submit-btn"
              >
                {busy ? "Signing in…" : "Sign in"} <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="text-center text-sm text-white/50 mt-5">
              No account?{" "}
              <Link to="/register" className="text-active hover:underline" data-testid="link-to-register">
                Create one
              </Link>
            </div>
          </div>

          <div className="text-center text-xs text-white/40 mt-6">
            You can also{" "}
            <Link to="/" className="text-white/70 hover:underline">join as guest</Link>{" "}
            without an account.
          </div>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
    </svg>
  );
}
