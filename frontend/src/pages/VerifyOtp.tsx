import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Button, Field, inputClass, HeartPulse } from "../components/ui";
import { redirectForRole } from "./Login";

export default function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/verify-otp", { email, code });
      localStorage.setItem("ham_token", res.data.token);
      const user = await refreshUser();
      redirectForRole(user.role, navigate);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    setResendMessage(null);
    setError(null);
    try {
      await api.post("/auth/resend-otp", { email });
      setResendMessage("A new code is on its way — check your inbox.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="ambient-blob absolute -top-32 -left-24 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />
        <div className="ambient-blob absolute bottom-0 right-0 w-96 h-96 rounded-full bg-amber/10 blur-3xl" style={{ animationDelay: "-8s" }} />
      </div>
      <div className="w-full max-w-sm animate-fade-in-scale">
        <div className="text-center mb-6">
          <HeartPulse className="text-2xl mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-semibold">Verify your email</h1>
          <p className="text-sm text-ink/60 mt-1">Enter the 6-digit code we sent to your inbox.</p>
        </div>
        <form onSubmit={onSubmit} className="glass-card rounded-xl shadow-card p-6 space-y-4">
          <Field label="Email">
            <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="6-digit code">
            <input
              className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
          </Field>
          {error && <p className="text-sm text-coral">{error}</p>}
          {resendMessage && <p className="text-sm text-teal-dark">{resendMessage}</p>}
          <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
            {submitting ? "Verifying…" : "Verify & continue"}
          </Button>
          <button
            type="button"
            onClick={resend}
            disabled={resending || !email}
            className="w-full text-sm text-teal font-medium hover:underline disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        </form>
      </div>
    </div>
  );
}
