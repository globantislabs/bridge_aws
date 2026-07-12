import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Video, LogOut, LayoutDashboard, ShieldCheck, Menu, X, Sparkles, Sun, Moon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function Nav({ transparent = false }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (p) => loc.pathname === p;

  return (
    <header
      className={`w-full z-30 ${
        transparent ? "absolute top-0 left-0" : "sticky top-0 backdrop-blur border-b"
      }`}
      style={
        transparent
          ? undefined
          : { background: "var(--c-nav-bg)", borderColor: "var(--c-border)" }
      }
      data-testid="site-nav"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-8 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white text-void flex items-center justify-center">
            <Video className="w-4 h-4" strokeWidth={2} />
          </div>
          <span className="h-brand text-xl font-medium">bridge</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm text-white/70">
          <NavLink to="/pricing" active={isActive("/pricing")}>Pricing</NavLink>
          {user && <NavLink to="/dashboard" active={isActive("/dashboard")}>Dashboard</NavLink>}
          {user?.role === "admin" && (
            <NavLink to="/admin" active={isActive("/admin")}>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={toggle}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            data-testid="theme-toggle-btn"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {!user ? (
            <>
              <Link to="/login" className="btn-ghost text-sm" data-testid="nav-login-btn">Sign in</Link>
              <Link to="/register" className="btn-primary text-sm !py-2 !px-4" data-testid="nav-register-btn">
                Get started
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-xs text-right leading-tight">
                <div className="text-white/90">{user.name}</div>
                <div className="text-white/40 uppercase tracking-widest text-[10px]">
                  {user.role === "admin" ? "admin" : user.plan_id?.replace("plan_", "") || "free"}
                </div>
              </div>
              <button
                onClick={async () => { await logout(); nav("/"); }}
                className="btn-ghost text-sm flex items-center gap-1"
                data-testid="nav-logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <button
          className="md:hidden p-2 rounded-lg border"
          style={{ background: "var(--c-milled)", borderColor: "var(--c-border)" }}
          onClick={() => setOpen((v) => !v)}
          data-testid="nav-mobile-toggle"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t px-4 py-4 space-y-2 animate-fade-in" style={{ background: "var(--c-nav-bg)", borderColor: "var(--c-border)" }}>
          <button
            onClick={toggle}
            className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2"
            style={{ background: "var(--c-milled)", border: "1px solid var(--c-border)" }}
            data-testid="mobile-theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <MobileLink to="/pricing">Pricing</MobileLink>
          {user && <MobileLink to="/dashboard"><LayoutDashboard className="inline w-4 h-4 mr-2" />Dashboard</MobileLink>}
          {user?.role === "admin" && (
            <MobileLink to="/admin"><ShieldCheck className="inline w-4 h-4 mr-2" />Admin</MobileLink>
          )}
          {!user ? (
            <>
              <MobileLink to="/login">Sign in</MobileLink>
              <MobileLink to="/register">
                <Sparkles className="inline w-4 h-4 mr-2" />Get started
              </MobileLink>
            </>
          ) : (
            <button
              onClick={async () => { await logout(); nav("/"); }}
              className="w-full text-left px-3 py-2 rounded-lg bg-white/5 text-sm"
              data-testid="mobile-logout-btn"
            >
              <LogOut className="inline w-4 h-4 mr-2" /> Sign out
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function NavLink({ to, children, active }) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-full transition-colors ${
        active ? "text-white bg-white/10" : "hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileLink({ to, children }) {
  return (
    <Link to={to} className="block px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-sm text-white/80">
      {children}
    </Link>
  );
}
