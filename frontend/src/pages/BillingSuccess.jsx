import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Nav from "../components/Nav";
import { api } from "../lib/api";
import { CheckCircle2, ArrowRight, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function BillingSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const nav = useNavigate();
  const [status, setStatus] = useState("polling"); // polling | paid | expired | error
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!sessionId) { nav("/pricing"); return; }
    let attempts = 0;
    const max = 8;

    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/checkout/status/${sessionId}`);
        setDetails(data);
        if (data.payment_status === "paid") {
          setStatus("paid");
          toast.success("Payment successful!");
          return;
        }
        if (data.status === "expired") {
          setStatus("expired");
          return;
        }
      } catch (e) {
        // ignore transient
      }
      if (attempts >= max) { setStatus("error"); return; }
      setTimeout(poll, 2000);
    };
    poll();
  }, [sessionId, nav]);

  return (
    <div className="min-h-screen flex flex-col" data-testid="billing-success-page">
      <Nav />
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="milled rounded-3xl p-8 sm:p-10 max-w-md w-full text-center">
          {status === "polling" && (
            <>
              <div className="w-3 h-3 rounded-full bg-active mx-auto animate-pulse mb-4" />
              <h1 className="h-brand text-2xl font-medium">Confirming your payment…</h1>
              <p className="text-white/50 text-sm mt-3">This should only take a moment.</p>
            </>
          )}
          {status === "paid" && (
            <>
              <CheckCircle2 className="w-14 h-14 text-active mx-auto mb-4" />
              <h1 className="h-brand text-2xl font-medium">Payment successful</h1>
              <p className="text-white/60 text-sm mt-3">
                Your plan is now active. Enjoy Bridge Pro features!
              </p>
              <button onClick={() => nav("/dashboard")} className="btn-primary mt-6 inline-flex items-center gap-2" data-testid="billing-continue-btn">
                Go to dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
          {(status === "expired" || status === "error") && (
            <>
              <XCircle className="w-14 h-14 text-signal mx-auto mb-4" />
              <h1 className="h-brand text-2xl font-medium">Payment not completed</h1>
              <p className="text-white/60 text-sm mt-3">
                {status === "expired" ? "The checkout session expired." : "We couldn't confirm the payment. Please try again."}
              </p>
              <button onClick={() => nav("/pricing")} className="btn-ghost mt-6" data-testid="billing-retry-btn">
                Back to pricing
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
