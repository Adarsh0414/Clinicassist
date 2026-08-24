import { FormEvent, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../api/client";
import { Button, Field, inputClass, HeartPulse } from "../components/ui";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export default function Login() {
  const { login, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      redirectForRole(user.role, navigate);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403 && err.response.data?.error === "EmailNotVerified") {
        navigate("/verify-otp", { state: { email: err.response.data.email ?? email } });
        return;
      }
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="ambient-blob absolute -top-32 -left-24 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />
        <div className="ambient-blob absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-amber/10 blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="ambient-blob absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-teal/5 blur-3xl" style={{ animationDelay: "-12s" }} />
      </div>
      <Link
        to="/"
        className="absolute top-5 left-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink bg-white/70 hover:bg-white border border-line rounded-lg px-3 py-1.5 transition-colors backdrop-blur-sm"
      >
        <span aria-hidden="true">←</span> Back
      </Link>
      <div className="w-full max-w-sm animate-fade-in-scale">
        <div className="text-center mb-6">
          <HeartPulse className="text-2xl mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-semibold">ClinicAssist</h1>
          <p className="text-sm text-ink/60 mt-1">Smart Healthcare Appointment &amp; Follow-up Management</p>
        </div>
        <form onSubmit={onSubmit} className="glass-card rounded-xl shadow-card p-6 space-y-4">
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                className={`${inputClass} pr-10`}
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70 text-xs font-medium"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <div className="text-right -mt-2">
            <Link to="/forgot-password" className="text-xs text-teal font-medium hover:underline">
              Forgot password?
            </Link>
          </div>
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          <div className="flex items-center gap-3 text-[11px] text-ink/35 font-medium uppercase tracking-wide">
            <span className="flex-1 h-px bg-line" />
            or continue with
            <span className="flex-1 h-px bg-line" />
          </div>

          <GoogleSignInButton
            onSuccess={async () => {
              const user = await refreshUser();
              redirectForRole(user.role, navigate);
            }}
            onError={(message) => setError(message)}
          />
        </form>
        <p className="text-center text-sm text-ink/60 mt-4">
          New patient?{" "}
          <Link to="/register" className="text-teal font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function redirectForRole(role: string, navigate: ReturnType<typeof useNavigate>) {
  if (role === "PATIENT") navigate("/patient/book");
  else if (role === "DOCTOR") navigate("/doctor");
  else navigate("/admin");
}
