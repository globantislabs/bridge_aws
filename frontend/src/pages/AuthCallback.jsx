import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const { exchangeGoogle } = useAuth();
  const nav = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    // Set synchronously to prevent React StrictMode double-processing.
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash;
    const match = /session_id=([^&]+)/.exec(hash);
    if (!match) {
      nav("/login");
      return;
    }
    const sid = decodeURIComponent(match[1]);
    (async () => {
      try {
        const user = await exchangeGoogle(sid);
        // Clean the hash immediately
        window.history.replaceState(null, "", window.location.pathname);
        toast.success(`Welcome, ${user.name}`);
        nav("/dashboard", { state: { user } });
      } catch (e) {
        toast.error("Sign-in failed");
        nav("/login");
      }
    })();
  }, [exchangeGoogle, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-3 h-3 rounded-full bg-active mx-auto animate-pulse mb-4" />
        <div className="text-white/60">Signing you in…</div>
      </div>
    </div>
  );
}
