import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../api/client";
import { Button, Field, inputClass } from "../components/ui";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setInfo(res.data.message);
      setStep("reset");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { email, code, newPassword });
      navigate("/login");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="ambient-blob absolute -top-32 -right-24 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />
      </div>
      <div className="w-full max-w-sm animate-fade-in-scale">
        <div className="text-center mb-6">
          <h1 className="font-serif text-2xl font-semibold">{step === "request" ? "Forgot your password?" : "Set a new password"}</h1>
          <p className="text-sm text-ink/60 mt-1">
            {step === "request" ? "We'll email you a code to reset it." : "Enter the code we just emailed you."}
          </p>
        </div>

        {step === "request" ? (
          <form onSubmit={requestCode} className="glass-card rounded-xl shadow-card p-6 space-y-4">
            <Field label="Email">
              <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-coral">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="glass-card rounded-xl shadow-card p-6 space-y-4">
            {info && <p className="text-sm text-teal-dark">{info}</p>}
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
            <Field label="New password">
              <input
                className={inputClass}
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-coral">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
              {submitting ? "Saving…" : "Reset password"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-ink/60 mt-4">
          <Link to="/login" className="text-teal font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
