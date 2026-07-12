import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import Landing from "./pages/Landing";
import Lobby from "./pages/Lobby";
import Meeting from "./pages/Meeting";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import BillingSuccess from "./pages/BillingSuccess";
import "./App.css";

function AppRouter() {
  const location = useLocation();
  // Detect OAuth session_id in URL fragment BEFORE rendering routes.
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/billing/success" element={<BillingSuccess />} />
      <Route path="/j/:code" element={<Lobby />} />
      <Route path="/m/:code" element={<Meeting />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="grain min-h-screen bg-void text-white">
          <AppRouter />
          <Toaster
            theme="system"
            position="top-center"
            toastOptions={{
              className: "milled",
              style: { color: "var(--c-text)" },
            }}
          />
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
